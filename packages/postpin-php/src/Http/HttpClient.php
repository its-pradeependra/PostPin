<?php

declare(strict_types=1);

namespace Postpin\Http;

use Postpin\Exception\ApiException;
use Postpin\Exception\AuthenticationException;
use Postpin\Exception\NotFoundException;
use Postpin\Exception\PermissionException;
use Postpin\Exception\PostpinException;
use Postpin\Exception\QuotaExceededException;
use Postpin\Exception\RateLimitException;
use Postpin\Exception\ValidationException;
use Postpin\Postpin;

/**
 * Internal HTTP layer: auth, retries with backoff, idempotency, and mapping of
 * the {data, meta} / error envelopes onto arrays and typed exceptions.
 *
 * @internal
 */
final class HttpClient
{
    private const RETRYABLE = [408, 409, 425, 429, 500, 502, 503, 504];

    private string $apiKey;
    private string $baseUrl;
    private float $timeout;
    private int $maxRetries;
    /** @var array<string, string> */
    private array $extraHeaders;
    private Transport $transport;
    /** @var callable(float): void */
    private $sleeper;

    /**
     * @param array<string, string> $extraHeaders
     */
    public function __construct(
        string $apiKey,
        string $baseUrl,
        float $timeout,
        int $maxRetries,
        array $extraHeaders,
        Transport $transport,
        ?callable $sleeper = null,
    ) {
        $this->apiKey = $apiKey;
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->timeout = $timeout;
        $this->maxRetries = max(0, $maxRetries);
        $this->extraHeaders = $extraHeaders;
        $this->transport = $transport;
        $this->sleeper = $sleeper ?? static function (float $seconds): void {
            usleep((int) ($seconds * 1_000_000));
        };
    }

    /**
     * @param array<string, scalar> $query
     * @param array<string, mixed>|null $body
     * @return mixed the decoded `data` field of the envelope
     */
    public function request(
        string $method,
        string $path,
        array $query = [],
        ?array $body = null,
        ?string $idempotencyKey = null,
    ): mixed {
        $url = $this->baseUrl . $path;
        if ($query !== []) {
            $url .= '?' . http_build_query($query);
        }

        $headers = [
            'Authorization' => 'Bearer ' . $this->apiKey,
            'Accept' => 'application/json',
            'User-Agent' => 'postpin-php/' . Postpin::VERSION,
            'X-Postpin-Client' => 'postpin-php/' . Postpin::VERSION,
        ];
        foreach ($this->extraHeaders as $name => $value) {
            $headers[$name] = $value;
        }

        $payload = null;
        if ($method === 'POST') {
            $payload = json_encode($body ?? new \stdClass(), JSON_THROW_ON_ERROR);
            $headers['Content-Type'] = 'application/json';
            $headers['Idempotency-Key'] = $idempotencyKey ?? self::uuid4();
        }

        $attempt = 0;
        while (true) {
            $request = new Request($method, $url, $headers, $payload, $this->timeout);

            try {
                $response = $this->transport->send($request);
            } catch (PostpinException $e) {
                if ($attempt < $this->maxRetries) {
                    $this->backoff($attempt, null);
                    $attempt++;
                    continue;
                }
                throw $e;
            }

            if ($response->statusCode >= 400) {
                if (in_array($response->statusCode, self::RETRYABLE, true) && $attempt < $this->maxRetries) {
                    $this->backoff($attempt, self::retryAfter($response->header('retry-after')));
                    $attempt++;
                    continue;
                }
                throw $this->errorFromResponse($response);
            }

            $decoded = $response->body === '' ? null : json_decode($response->body, true);
            if (is_array($decoded) && array_key_exists('data', $decoded)) {
                return $decoded['data'];
            }
            return $decoded;
        }
    }

    private function backoff(int $attempt, ?float $retryAfter): void
    {
        if ($retryAfter !== null && $retryAfter >= 0) {
            $delay = $retryAfter;
        } else {
            $base = min(8.0, 0.5 * (2 ** $attempt));
            $delay = (mt_rand() / mt_getrandmax()) * $base; // full jitter
        }
        ($this->sleeper)($delay);
    }

    private function errorFromResponse(Response $response): PostpinException
    {
        $status = $response->statusCode;
        $body = json_decode($response->body, true);

        $code = null;
        $message = null;
        $requestId = null;
        $details = null;
        if (is_array($body) && isset($body['error']) && is_array($body['error'])) {
            $err = $body['error'];
            $code = $err['code'] ?? null;
            $message = $err['message'] ?? null;
            $requestId = $err['request_id'] ?? null;
            $details = $err['details'] ?? null;
        }

        $message ??= "Postpin API error (HTTP {$status}).";
        $requestId ??= $response->header('x-request-id');
        $headers = $response->headers;

        return match (true) {
            $status === 401 => new AuthenticationException($message, $code, $status, $requestId, $details, $headers),
            $status === 403 => new PermissionException($message, $code, $status, $requestId, $details, $headers),
            $status === 400, $status === 422 => new ValidationException($message, $code, $status, $requestId, $details, $headers),
            $status === 404 => new NotFoundException($message, $code, $status, $requestId, $details, $headers),
            $status === 402 => new QuotaExceededException($message, $code, $status, $requestId, $details, $headers),
            $status === 429 => new RateLimitException($message, self::retryAfter($response->header('retry-after')), $code, $status, $requestId, $details, $headers),
            $status >= 500 => new ApiException($message, $code, $status, $requestId, $details, $headers),
            default => new PostpinException($message, $code, $status, $requestId, $details, $headers),
        };
    }

    private static function retryAfter(?string $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }
        return is_numeric($value) ? (float) $value : null;
    }

    private static function uuid4(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}

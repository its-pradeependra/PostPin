<?php

declare(strict_types=1);

namespace Postpin\Exception;

/** HTTP 429 — too many requests. $retryAfter is the server hint in seconds. */
class RateLimitException extends PostpinException
{
    public function __construct(
        string $message,
        public readonly ?float $retryAfter = null,
        ?string $errorCode = null,
        ?int $statusCode = null,
        ?string $requestId = null,
        mixed $details = null,
        array $headers = [],
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, $errorCode, $statusCode, $requestId, $details, $headers, $previous);
    }
}

<?php

declare(strict_types=1);

namespace Postpin\Tests;

use PHPUnit\Framework\TestCase;
use Postpin\Client;
use Postpin\Exception\ApiException;
use Postpin\Exception\AuthenticationException;
use Postpin\Exception\ConnectionException;
use Postpin\Exception\NotFoundException;
use Postpin\Exception\PostpinException;
use Postpin\Exception\QuotaExceededException;
use Postpin\Exception\RateLimitException;
use Postpin\Exception\TimeoutException;
use Postpin\Exception\ValidationException;
use Postpin\Http\Response;
use Postpin\Tests\Support\MockTransport;

final class ClientTest extends TestCase
{
    private MockTransport $transport;

    private const RATE = [
        'zone' => 'metro',
        'zoneLabel' => 'Metro',
        'service' => 'express',
        'serviceLabel' => 'Express',
        'chargeableWeightGrams' => 1200,
        'volumetricWeightGrams' => 0,
        'etaDays' => [1, 3],
        'currency' => 'INR',
        'breakdown' => [['label' => 'Base charge', 'amount' => 88]],
        'total' => 254.38,
        'totalPaise' => 25438,
        'origin' => ['pincode' => '400001', 'city' => 'Mumbai', 'state' => 'Maharashtra'],
        'destination' => ['pincode' => '110001', 'city' => 'New Delhi', 'state' => 'Delhi'],
        'serviceable' => true,
    ];

    /**
     * @param array<int, callable(): Response> $responses
     * @param array<string, mixed> $options
     */
    private function client(array $responses, array $options = []): Client
    {
        $this->transport = new MockTransport($responses);
        return new Client('pp_test', array_merge(
            ['transport' => $this->transport, 'sleeper' => static fn () => null],
            $options,
        ));
    }

    private static function ok(mixed $data, array $headers = []): Response
    {
        return new Response(
            200,
            (string) json_encode(['data' => $data, 'meta' => ['request_id' => 'req_1']]),
            array_merge(['content-type' => 'application/json'], $headers),
        );
    }

    private static function err(int $status, string $code, array $headers = []): Response
    {
        return new Response(
            $status,
            (string) json_encode(['error' => ['code' => $code, 'message' => 'boom', 'request_id' => 'req_err']]),
            $headers,
        );
    }

    public function testRequiresApiKey(): void
    {
        $this->expectException(PostpinException::class);
        new Client('');
    }

    public function testRatesCalculateBodyAndHeaders(): void
    {
        $client = $this->client([fn () => self::ok(self::RATE)]);

        $rate = $client->rates->calculate([
            'origin' => '400001',
            'destination' => '110001',
            'weight' => 1200,
            'service' => 'express',
            'cod' => true,
            'declared_value' => 1499,
        ]);

        $this->assertSame(254.38, $rate['total']);
        $this->assertSame('Metro', $rate['zoneLabel']);

        $req = $this->transport->requests[0];
        $this->assertSame('https://api.postpin.in/v1/rates/calculate', $req->url);
        $this->assertSame('POST', $req->method);
        $this->assertSame('Bearer pp_test', $req->headers['Authorization']);
        $this->assertStringStartsWith('postpin-php/', $req->headers['User-Agent']);
        $this->assertNotEmpty($req->headers['Idempotency-Key']);

        $body = json_decode((string) $req->body, true);
        $this->assertSame([
            'origin' => '400001',
            'destination' => '110001',
            'weight' => 1200,
            'service' => 'express',
            'cod' => true,
            'declared_value' => 1499,
        ], $body);
    }

    public function testExplicitIdempotencyKey(): void
    {
        $client = $this->client([fn () => self::ok(self::RATE)]);
        $client->rates->calculate([
            'origin' => '400001', 'destination' => '110001', 'weight' => 500,
            'idempotency_key' => 'my-key',
        ]);
        $this->assertSame('my-key', $this->transport->requests[0]->headers['Idempotency-Key']);
    }

    public function testServiceabilityCheck(): void
    {
        $client = $this->client([fn () => self::ok(['pincode' => '781001', 'serviceable' => true, 'found' => true, 'city' => 'Guwahati', 'state' => 'Assam'])]);
        $s = $client->serviceability->check('781001');
        $this->assertSame('Guwahati', $s['city']);
        $this->assertSame('https://api.postpin.in/v1/public/serviceability/781001', $this->transport->requests[0]->url);
        $this->assertSame('GET', $this->transport->requests[0]->method);
    }

    public function testPincodesGetAndStates(): void
    {
        $client = $this->client([
            fn () => self::ok(['pincode' => '302001', 'city' => 'Jaipur', 'state' => 'Rajasthan', 'is_metro' => false, 'is_remote' => false, 'serviceable' => true, 'nearby' => []]),
            fn () => self::ok([['state' => 'Rajasthan', 'slug' => 'rajasthan', 'count' => 100, 'metros' => 0]]),
        ]);
        $this->assertSame('Jaipur', $client->pincodes->get('302001')['city']);
        $this->assertSame('rajasthan', $client->pincodes->states()[0]['slug']);
    }

    public function testPlansList(): void
    {
        $client = $this->client([fn () => self::ok([['code' => 'free', 'name' => 'Free', 'included_calls' => 1000]])]);
        $this->assertSame('free', $client->plans->list()[0]['code']);
    }

    /**
     * @return array<string, array{int, string, class-string}>
     */
    public static function errorProvider(): array
    {
        return [
            'validation' => [400, 'validation_error', ValidationException::class],
            'auth' => [401, 'invalid_key', AuthenticationException::class],
            'quota' => [402, 'quota_exceeded', QuotaExceededException::class],
            'not_found' => [404, 'not_found', NotFoundException::class],
            'server' => [500, 'internal', ApiException::class],
        ];
    }

    /**
     * @dataProvider errorProvider
     * @param class-string $class
     */
    public function testErrorMapping(int $status, string $code, string $class): void
    {
        $client = $this->client([fn () => self::err($status, $code)], ['max_retries' => 0]);
        try {
            $client->pincodes->get('000000');
            $this->fail('expected an exception');
        } catch (PostpinException $e) {
            $this->assertInstanceOf($class, $e);
            $this->assertSame($code, $e->errorCode);
            $this->assertSame($status, $e->statusCode);
            $this->assertSame('req_err', $e->requestId);
        }
    }

    public function testRateLimitCarriesRetryAfter(): void
    {
        $client = $this->client([fn () => self::err(429, 'rate_limited', ['retry-after' => '42'])], ['max_retries' => 0]);
        try {
            $client->rates->calculate(['origin' => '400001', 'destination' => '110001', 'weight' => 500]);
            $this->fail('expected rate limit');
        } catch (RateLimitException $e) {
            $this->assertSame(42.0, $e->retryAfter);
        }
    }

    public function testRetries500ThenSucceeds(): void
    {
        $client = $this->client([
            fn () => self::err(500, 'internal'),
            fn () => self::ok(self::RATE),
        ], ['max_retries' => 2]);
        $rate = $client->rates->calculate(['origin' => '400001', 'destination' => '110001', 'weight' => 500]);
        $this->assertSame(254.38, $rate['total']);
        $this->assertSame(2, $this->transport->count());
    }

    public function testRetriesNetworkErrorThenSucceeds(): void
    {
        $client = $this->client([
            fn () => throw new ConnectionException('boom'),
            fn () => self::ok(self::RATE),
        ], ['max_retries' => 1]);
        $rate = $client->rates->calculate(['origin' => '400001', 'destination' => '110001', 'weight' => 500]);
        $this->assertSame(254.38, $rate['total']);
        $this->assertSame(2, $this->transport->count());
    }

    public function testGivesUpAfterMaxRetries(): void
    {
        $client = $this->client([fn () => self::err(503, 'unavailable')], ['max_retries' => 2]);
        try {
            $client->pincodes->get('302001');
            $this->fail('expected api exception');
        } catch (ApiException $e) {
            $this->assertSame(3, $this->transport->count());
        }
    }

    public function testDoesNotRetry400(): void
    {
        $client = $this->client([fn () => self::err(400, 'validation_error')], ['max_retries' => 3]);
        try {
            $client->pincodes->get('bad');
            $this->fail('expected validation exception');
        } catch (ValidationException $e) {
            $this->assertSame(1, $this->transport->count());
        }
    }

    public function testConnectionErrorSurfaced(): void
    {
        $client = $this->client([fn () => throw new ConnectionException('refused')], ['max_retries' => 1]);
        $this->expectException(ConnectionException::class);
        $client->plans->list();
    }

    public function testTimeoutSurfaced(): void
    {
        $client = $this->client([fn () => throw new TimeoutException('slow')], ['max_retries' => 0]);
        $this->expectException(TimeoutException::class);
        $client->plans->list();
    }
}

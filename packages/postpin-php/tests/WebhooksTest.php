<?php

declare(strict_types=1);

namespace Postpin\Tests;

use PHPUnit\Framework\TestCase;
use Postpin\Exception\SignatureVerificationException;
use Postpin\Webhooks;

final class WebhooksTest extends TestCase
{
    private const SECRET = 'whsec_test_secret';
    private const NOW = 1_718_900_000;

    private string $payload;

    protected function setUp(): void
    {
        $this->payload = (string) json_encode([
            'id' => 'evt_1',
            'event' => 'rate.calculated',
            'created' => '2026-07-01T00:00:00Z',
            'data' => ['total' => 254.38],
        ]);
    }

    private function sign(string $payload, int $ts, string $secret = self::SECRET): string
    {
        $v1 = hash_hmac('sha256', $ts . '.' . $payload, $secret);
        return "t={$ts},v1={$v1}";
    }

    public function testAcceptsValidSignature(): void
    {
        $this->assertTrue(Webhooks::verify($this->payload, $this->sign($this->payload, self::NOW), self::SECRET, now: self::NOW));
    }

    public function testRejectsTamperedPayload(): void
    {
        $this->expectException(SignatureVerificationException::class);
        Webhooks::verify($this->payload . ' ', $this->sign($this->payload, self::NOW), self::SECRET, now: self::NOW);
    }

    public function testRejectsWrongSecret(): void
    {
        try {
            Webhooks::verify($this->payload, $this->sign($this->payload, self::NOW, 'whsec_wrong'), self::SECRET, now: self::NOW);
            $this->fail('expected signature error');
        } catch (SignatureVerificationException $e) {
            $this->assertSame('signature_mismatch', $e->errorCode);
        }
    }

    public function testRejectsStaleTimestamp(): void
    {
        try {
            Webhooks::verify($this->payload, $this->sign($this->payload, self::NOW - 10_000), self::SECRET, toleranceSeconds: 300, now: self::NOW);
            $this->fail('expected timestamp error');
        } catch (SignatureVerificationException $e) {
            $this->assertSame('signature_timestamp', $e->errorCode);
        }
    }

    public function testAllowsStaleWhenToleranceDisabled(): void
    {
        $this->assertTrue(Webhooks::verify($this->payload, $this->sign($this->payload, self::NOW - 10_000), self::SECRET, toleranceSeconds: 0, now: self::NOW));
    }

    public function testRejectsMissingHeader(): void
    {
        try {
            Webhooks::verify($this->payload, '', self::SECRET);
            $this->fail('expected missing');
        } catch (SignatureVerificationException $e) {
            $this->assertSame('signature_missing', $e->errorCode);
        }
    }

    public function testRejectsMalformedHeader(): void
    {
        try {
            Webhooks::verify($this->payload, 'garbage', self::SECRET);
            $this->fail('expected malformed');
        } catch (SignatureVerificationException $e) {
            $this->assertSame('signature_malformed', $e->errorCode);
        }
    }

    public function testConstructEventReturnsParsedEvent(): void
    {
        $event = Webhooks::constructEvent($this->payload, $this->sign($this->payload, self::NOW), self::SECRET, now: self::NOW);
        $this->assertSame('evt_1', $event['id']);
        $this->assertSame('rate.calculated', $event['event']);
        $this->assertSame(254.38, $event['data']['total']);
    }

    public function testConstructEventVerifiesFirst(): void
    {
        $this->expectException(SignatureVerificationException::class);
        Webhooks::constructEvent($this->payload, $this->sign($this->payload, self::NOW, 'nope'), self::SECRET, now: self::NOW);
    }
}

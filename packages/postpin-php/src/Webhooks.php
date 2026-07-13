<?php

declare(strict_types=1);

namespace Postpin;

use Postpin\Exception\SignatureVerificationException;

/**
 * Verify inbound Postpin webhooks.
 *
 * Postpin signs each delivery with:
 *   X-Postpin-Signature: t=<unix-seconds>,v1=<hex hmac-sha256("<t>.<rawBody>", secret)>
 *
 * ALWAYS verify against the RAW request body — re-serializing the JSON changes
 * whitespace/key order and breaks the signature.
 */
final class Webhooks
{
    public const DEFAULT_TOLERANCE_SECONDS = 300;

    /**
     * Verify a webhook signature. Returns true on success; throws
     * {@see SignatureVerificationException} on any failure.
     */
    public static function verify(
        string $payload,
        ?string $signatureHeader,
        string $secret,
        int $toleranceSeconds = self::DEFAULT_TOLERANCE_SECONDS,
        ?int $now = null,
    ): bool {
        if ($signatureHeader === null || $signatureHeader === '') {
            throw new SignatureVerificationException('Missing Postpin signature header.', errorCode: 'signature_missing');
        }
        if ($secret === '') {
            throw new SignatureVerificationException('A webhook signing secret is required.', errorCode: 'secret_missing');
        }

        [$t, $v1] = self::parse($signatureHeader);
        if ($t === null || $v1 === null) {
            throw new SignatureVerificationException('Malformed Postpin signature header.', errorCode: 'signature_malformed');
        }

        $expected = hash_hmac('sha256', $t . '.' . $payload, $secret);
        if (!hash_equals($expected, $v1)) {
            throw new SignatureVerificationException(
                'Webhook signature does not match — payload may be forged or the secret is wrong.',
                errorCode: 'signature_mismatch',
            );
        }

        if ($toleranceSeconds > 0) {
            $current = $now ?? time();
            if (abs($current - $t) > $toleranceSeconds) {
                throw new SignatureVerificationException(
                    "Webhook timestamp is outside the allowed tolerance of {$toleranceSeconds}s (possible replay).",
                    errorCode: 'signature_timestamp',
                );
            }
        }

        return true;
    }

    /**
     * Verify the signature and return the parsed event array.
     *
     * @return array<string, mixed>
     */
    public static function constructEvent(
        string $payload,
        ?string $signatureHeader,
        string $secret,
        int $toleranceSeconds = self::DEFAULT_TOLERANCE_SECONDS,
        ?int $now = null,
    ): array {
        self::verify($payload, $signatureHeader, $secret, $toleranceSeconds, $now);
        $event = json_decode($payload, true);
        if (!is_array($event)) {
            throw new SignatureVerificationException('Webhook payload is not valid JSON.', errorCode: 'invalid_json');
        }
        return $event;
    }

    /**
     * @return array{0: int|null, 1: string|null}
     */
    private static function parse(string $header): array
    {
        $t = null;
        $v1 = null;
        foreach (explode(',', $header) as $part) {
            $pos = strpos($part, '=');
            if ($pos === false) {
                continue;
            }
            $key = trim(substr($part, 0, $pos));
            $val = trim(substr($part, $pos + 1));
            if ($key === 't' && is_numeric($val)) {
                $t = (int) $val;
            } elseif ($key === 'v1') {
                $v1 = $val;
            }
        }
        return [$t, $v1];
    }
}

<?php

declare(strict_types=1);

namespace Postpin\Resource;

use Postpin\Http\HttpClient;

/** Shipping-rate calculation. */
final class Rates
{
    public function __construct(private readonly HttpClient $http)
    {
    }

    /**
     * Calculate the shipping rate between two Indian pincodes.
     *
     * Supported $params keys: origin (string), destination (string),
     * weight (int, grams), length/width/height (float, cm),
     * service ("surface"|"express"|"same_day"), cod (bool),
     * declared_value (float, rupees), idempotency_key (string).
     *
     * @param array<string, mixed> $params
     * @return array<string, mixed> the rate result
     */
    public function calculate(array $params): array
    {
        $idempotencyKey = $params['idempotency_key'] ?? null;
        unset($params['idempotency_key']);

        $body = [
            'origin' => $params['origin'] ?? null,
            'destination' => $params['destination'] ?? null,
            'weight' => $params['weight'] ?? null,
        ];
        foreach (['length', 'width', 'height', 'service', 'cod', 'declared_value'] as $key) {
            if (array_key_exists($key, $params)) {
                $body[$key] = $params[$key];
            }
        }

        return (array) $this->http->request('POST', '/rates/calculate', [], $body, $idempotencyKey);
    }
}

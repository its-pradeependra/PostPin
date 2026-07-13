<?php

declare(strict_types=1);

namespace Postpin\Resource;

use Postpin\Http\HttpClient;

/** Pincode directory lookups. */
final class Pincodes
{
    public function __construct(private readonly HttpClient $http)
    {
    }

    /**
     * Look up a single pincode, including nearby serviceable pincodes.
     *
     * @return array<string, mixed>
     */
    public function get(string $code): array
    {
        return (array) $this->http->request('GET', '/public/pincodes/' . rawurlencode($code));
    }

    /**
     * List every state with its serviceable-pincode counts.
     *
     * @return array<int, array<string, mixed>>
     */
    public function states(): array
    {
        return (array) $this->http->request('GET', '/public/pincodes/states');
    }
}

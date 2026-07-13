<?php

declare(strict_types=1);

namespace Postpin\Resource;

use Postpin\Http\HttpClient;

/** Pincode serviceability checks. */
final class Serviceability
{
    public function __construct(private readonly HttpClient $http)
    {
    }

    /**
     * Check whether a pincode is serviceable.
     *
     * @return array<string, mixed>
     */
    public function check(string $pincode): array
    {
        return (array) $this->http->request('GET', '/public/serviceability/' . rawurlencode($pincode));
    }
}

<?php

declare(strict_types=1);

namespace Postpin\Resource;

use Postpin\Http\HttpClient;

/** Public subscription plans. */
final class Plans
{
    public function __construct(private readonly HttpClient $http)
    {
    }

    /**
     * List all public, active subscription plans.
     *
     * @return array<int, array<string, mixed>>
     */
    public function list(): array
    {
        return (array) $this->http->request('GET', '/public/plans');
    }
}

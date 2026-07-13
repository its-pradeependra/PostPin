<?php

declare(strict_types=1);

namespace Postpin\Tests\Support;

use Postpin\Http\Request;
use Postpin\Http\Response;
use Postpin\Http\Transport;

/**
 * A fake Transport that returns queued responses in order (the last one
 * repeats) and records every request. Each queued item is a callable that
 * either returns a Response or throws.
 */
final class MockTransport implements Transport
{
    /** @var array<int, Request> */
    public array $requests = [];

    /** @var array<int, callable(): Response> */
    private array $responses;

    private int $index = 0;

    /** @param array<int, callable(): Response> $responses */
    public function __construct(array $responses)
    {
        $this->responses = $responses;
    }

    public function send(Request $request): Response
    {
        $this->requests[] = $request;
        $i = min($this->index, count($this->responses) - 1);
        $this->index++;
        return ($this->responses[$i])();
    }

    public function count(): int
    {
        return count($this->requests);
    }
}

<?php

declare(strict_types=1);

namespace Postpin\Http;

use Postpin\Exception\ConnectionException;
use Postpin\Exception\TimeoutException;

/**
 * Sends an HTTP request and returns the raw response. Implementations must
 * throw {@see TimeoutException} on timeout and {@see ConnectionException} on any
 * other network failure. This seam makes the client fully testable without a
 * network.
 */
interface Transport
{
    public function send(Request $request): Response;
}

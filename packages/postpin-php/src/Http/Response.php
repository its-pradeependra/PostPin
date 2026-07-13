<?php

declare(strict_types=1);

namespace Postpin\Http;

/** An inbound HTTP response. */
final class Response
{
    /**
     * @param array<string, string> $headers lower-cased header names
     */
    public function __construct(
        public readonly int $statusCode,
        public readonly string $body,
        public readonly array $headers = [],
    ) {
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }
}

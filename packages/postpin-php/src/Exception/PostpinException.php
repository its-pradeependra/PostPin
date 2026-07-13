<?php

declare(strict_types=1);

namespace Postpin\Exception;

/**
 * Base class for every exception thrown by the SDK.
 */
class PostpinException extends \Exception
{
    public function __construct(
        string $message,
        public readonly ?string $errorCode = null,
        public readonly ?int $statusCode = null,
        public readonly ?string $requestId = null,
        public readonly mixed $details = null,
        public readonly array $headers = [],
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }
}

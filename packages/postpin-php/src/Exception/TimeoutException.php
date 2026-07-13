<?php

declare(strict_types=1);

namespace Postpin\Exception;

/** The request exceeded the configured timeout. */
class TimeoutException extends ConnectionException
{
}

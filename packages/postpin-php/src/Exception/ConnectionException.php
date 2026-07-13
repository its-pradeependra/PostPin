<?php

declare(strict_types=1);

namespace Postpin\Exception;

/** The request never reached Postpin (DNS, TCP, TLS, or a dropped connection). */
class ConnectionException extends PostpinException
{
}

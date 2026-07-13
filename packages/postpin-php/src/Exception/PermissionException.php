<?php

declare(strict_types=1);

namespace Postpin\Exception;

/** HTTP 403 — the key is valid but lacks the required scope. */
class PermissionException extends PostpinException
{
}

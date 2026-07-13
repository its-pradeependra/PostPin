<?php

declare(strict_types=1);

namespace Postpin\Exception;

/** HTTP 402 — the account's monthly quota is used up. */
class QuotaExceededException extends PostpinException
{
}

<?php

declare(strict_types=1);

namespace Postpin;

use Postpin\Exception\PostpinException;
use Postpin\Http\CurlTransport;
use Postpin\Http\HttpClient;
use Postpin\Http\Transport;
use Postpin\Resource\Pincodes;
use Postpin\Resource\Plans;
use Postpin\Resource\Rates;
use Postpin\Resource\Serviceability;

/**
 * The Postpin API client.
 *
 * @example
 *   $postpin = new \Postpin\Client(getenv('POSTPIN_API_KEY'));
 *   $rate = $postpin->rates->calculate([
 *       'origin' => '400001', 'destination' => '110001', 'weight' => 1200,
 *   ]);
 */
final class Client
{
    public const VERSION = Postpin::VERSION;

    public readonly Rates $rates;
    public readonly Serviceability $serviceability;
    public readonly Pincodes $pincodes;
    public readonly Plans $plans;

    /**
     * @param array{
     *     base_url?: string,
     *     timeout?: float,
     *     max_retries?: int,
     *     headers?: array<string, string>,
     *     transport?: Transport,
     *     sleeper?: callable
     * } $options
     */
    public function __construct(string $apiKey, array $options = [])
    {
        if (trim($apiKey) === '') {
            throw new PostpinException('A Postpin API key is required.', errorCode: 'config_error');
        }

        $http = new HttpClient(
            $apiKey,
            $options['base_url'] ?? 'https://api.postpin.in/v1',
            (float) ($options['timeout'] ?? 30.0),
            (int) ($options['max_retries'] ?? 2),
            $options['headers'] ?? [],
            $options['transport'] ?? new CurlTransport(),
            $options['sleeper'] ?? null,
        );

        $this->rates = new Rates($http);
        $this->serviceability = new Serviceability($http);
        $this->pincodes = new Pincodes($http);
        $this->plans = new Plans($http);
    }
}

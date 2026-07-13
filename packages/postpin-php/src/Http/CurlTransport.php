<?php

declare(strict_types=1);

namespace Postpin\Http;

use Postpin\Exception\ConnectionException;
use Postpin\Exception\TimeoutException;

/** Default {@see Transport} backed by ext-curl. */
final class CurlTransport implements Transport
{
    public function send(Request $request): Response
    {
        $ch = curl_init();

        $headers = [];
        foreach ($request->headers as $name => $value) {
            $headers[] = $name . ': ' . $value;
        }

        curl_setopt_array($ch, [
            CURLOPT_URL => $request->url,
            CURLOPT_CUSTOMREQUEST => $request->method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER => true,
            CURLOPT_TIMEOUT_MS => (int) ($request->timeout * 1000),
            CURLOPT_CONNECTTIMEOUT_MS => (int) ($request->timeout * 1000),
        ]);

        if ($request->body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $request->body);
        }

        $raw = curl_exec($ch);
        if ($raw === false) {
            $errno = curl_errno($ch);
            $error = curl_error($ch);
            curl_close($ch);
            if ($errno === CURLE_OPERATION_TIMEOUTED) {
                throw new TimeoutException("Request timed out: {$error}", errorCode: 'timeout');
            }
            throw new ConnectionException("Could not reach Postpin: {$error}", errorCode: 'connection_error');
        }

        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $rawStr = (string) $raw;
        $rawHeaders = substr($rawStr, 0, $headerSize);
        $body = substr($rawStr, $headerSize);

        return new Response($status, $body, self::parseHeaders($rawHeaders));
    }

    /**
     * @return array<string, string>
     */
    private static function parseHeaders(string $raw): array
    {
        $headers = [];
        foreach (preg_split('/\r?\n/', $raw) ?: [] as $line) {
            $pos = strpos($line, ':');
            if ($pos === false) {
                continue;
            }
            $name = strtolower(trim(substr($line, 0, $pos)));
            $headers[$name] = trim(substr($line, $pos + 1));
        }
        return $headers;
    }
}

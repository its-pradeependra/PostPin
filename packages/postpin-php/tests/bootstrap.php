<?php

declare(strict_types=1);

// Minimal PSR-4 autoloader so the suite runs without a Composer install.
spl_autoload_register(static function (string $class): void {
    $map = [
        'Postpin\\Tests\\' => __DIR__ . '/',
        'Postpin\\' => __DIR__ . '/../src/',
    ];
    foreach ($map as $prefix => $base) {
        if (str_starts_with($class, $prefix)) {
            $relative = substr($class, strlen($prefix));
            $file = $base . str_replace('\\', '/', $relative) . '.php';
            if (is_file($file)) {
                require $file;
            }
            return;
        }
    }
});

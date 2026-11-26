<?php

namespace App\Services\Newsletter;

use App\Services\Newsletter\Categories\UpcomingEventsCategory;
use App\Services\Newsletter\Contracts\NotificationCategory;
use Illuminate\Contracts\Container\Container;
use InvalidArgumentException;

/**
 * The newsletter notification categories that exist. Kept in code (not in a
 * config file) so it works with the project's cached configuration.
 */
class NotificationCategoryRegistry
{
    /** @var list<class-string<NotificationCategory>> */
    private const CATEGORIES = [
        UpcomingEventsCategory::class,
    ];

    public function __construct(private readonly Container $container)
    {
    }

    /** @return array<string, NotificationCategory> keyed by category key */
    public function all(): array
    {
        $categories = [];

        foreach (self::CATEGORIES as $class) {
            $category = $this->container->make($class);
            $categories[$category->key()] = $category;
        }

        return $categories;
    }

    public function has(string $key): bool
    {
        return array_key_exists($key, $this->all());
    }

    public function get(string $key): NotificationCategory
    {
        return $this->all()[$key] ?? throw new InvalidArgumentException("Unknown newsletter notification category [{$key}].");
    }
}

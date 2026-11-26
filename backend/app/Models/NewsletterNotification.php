<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * One row per (category, item, subscriber): the delivery log shared by all
 * newsletter notification categories.
 */
class NewsletterNotification extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_SENDING = 'sending';
    public const STATUS_SENT = 'sent';
    public const STATUS_FAILED = 'failed';

    public const STATUSES = [
        self::STATUS_PENDING => 'Pending',
        self::STATUS_SENDING => 'Sending',
        self::STATUS_SENT => 'Sent',
        self::STATUS_FAILED => 'Failed',
    ];

    protected $fillable = [
        'category',
        'reference_id',
        'newsletter_subscriber_id',
        'status',
        'attempts',
        'send_count',
        'last_trigger',
        'sent_at',
        'last_attempt_at',
        'last_error',
    ];

    protected function casts(): array
    {
        return [
            'reference_id' => 'integer',
            'attempts' => 'integer',
            'send_count' => 'integer',
            'sent_at' => 'datetime',
            'last_attempt_at' => 'datetime',
        ];
    }

    public function scopeForCategory(Builder $query, string $category): Builder
    {
        return $query->where('category', $category);
    }

    public function scopeForItem(Builder $query, string $category, int $referenceId): Builder
    {
        return $query->where('category', $category)->where('reference_id', $referenceId);
    }

    public function subscriber()
    {
        return $this->belongsTo(NewsletterSubscriber::class, 'newsletter_subscriber_id');
    }
}

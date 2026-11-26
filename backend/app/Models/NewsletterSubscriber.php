<?php

namespace App\Models;

use App\Services\Newsletter\Contracts\NotificationCategory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class NewsletterSubscriber extends Model
{
    public const STATUS_ACTIVE = 1;
    public const STATUS_INACTIVE = 0;

    /** Filter / display states derived from is_verified, status and unsubscribed_at. */
    public const STATES = [
        'active' => 'Active',
        'pending' => 'Pending Verification',
        'inactive' => 'Inactive',
        'unsubscribed' => 'Unsubscribed',
    ];

    protected $fillable = [
        'email',
        'verification_token',
        'verification_sent_at',
        'is_verified',
        'verified_at',
        'status',
        'notify_upcoming_events',
        'subscribed_at',
        'unsubscribed_at',
        'ip_address',
        'user_agent',
        'updated_by',
    ];

    protected $hidden = ['verification_token'];

    protected function casts(): array
    {
        return [
            'is_verified' => 'boolean',
            'status' => 'integer',
            'notify_upcoming_events' => 'boolean',
            'verification_sent_at' => 'datetime',
            'verified_at' => 'datetime',
            'subscribed_at' => 'datetime',
            'unsubscribed_at' => 'datetime',
        ];
    }

    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by', 'id');
    }

    public function scopeState(Builder $query, ?string $state): Builder
    {
        return match ($state) {
            'active' => $query->where('is_verified', true)->where('status', self::STATUS_ACTIVE)->whereNull('unsubscribed_at'),
            'pending' => $query->where('is_verified', false)->whereNull('unsubscribed_at'),
            'inactive' => $query->where('is_verified', true)->where('status', self::STATUS_INACTIVE)->whereNull('unsubscribed_at'),
            'unsubscribed' => $query->whereNotNull('unsubscribed_at'),
            default => $query,
        };
    }

    /** Active (verified, enabled, not unsubscribed) and opted in to the given notification category. */
    public function scopeEligibleFor(Builder $query, NotificationCategory $category): Builder
    {
        return $query->state('active')->where($category->preferenceColumn(), true);
    }

    public function notifications()
    {
        return $this->hasMany(NewsletterNotification::class);
    }

    public function getStateAttribute(): string
    {
        if ($this->unsubscribed_at) {
            return 'unsubscribed';
        }

        if (! $this->is_verified) {
            return 'pending';
        }

        return $this->status === self::STATUS_ACTIVE ? 'active' : 'inactive';
    }

    public function getStateLabelAttribute(): string
    {
        return self::STATES[$this->state];
    }

    public function isActiveSubscriber(): bool
    {
        return $this->state === 'active';
    }
}

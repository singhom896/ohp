<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * FAQ page for the website header menu "FAQ" (/faq), managed in
 * CMS Management -> Content (CKEditor). The menu becomes a "Content" type
 * menu so the page is attached to it; the starter questions can be edited.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $menu = DB::table('menu_items')->where('url', '/faq')->whereNull('parent_id')->first();
        if (! $menu || DB::table('contents')->where('slug', 'faq')->exists()) {
            return;
        }

        DB::table('menu_items')->where('id', $menu->id)->update(['type' => 2, 'updated_at' => $now]);
        DB::table('contents')->insert([
            'menu_id' => $menu->id, 'slug' => 'faq', 'title' => 'Frequently Asked Questions',
            'content' => $this->html(), 'is_active' => 1, 'created_at' => $now, 'updated_at' => $now,
        ]);
    }

    public function down(): void
    {
        DB::table('contents')->where('slug', 'faq')->delete();
        DB::table('menu_items')->where('url', '/faq')->whereNull('parent_id')->update(['type' => 1]);
    }

    private function html(): string
    {
        $qa = [
            ['What is Opportunity Hub?', 'Opportunity Hub is a platform of the Ministry of Culture, Government of India, that connects Indian artists, artist groups and cultural institutions with performance opportunities at events, festivals, hotels and government programmes.'],
            ['Who can register?', 'Individual artists, artist groups and organisations / institutes can register. Choose the matching account type on the Register page.'],
            ['Is registration free?', 'Yes. Registering and maintaining a profile on Opportunity Hub is free of charge.'],
            ['How do I complete my profile?', 'After you sign in, open <strong>My Profile</strong> from the top-right menu, fill in your details, art forms, location and work samples, and save.'],
            ['How long does verification take?', 'Your registration is reviewed by the department. You can see the current status (Under review, Approved or Rejected) on your My Profile page.'],
            ['I forgot my password. What should I do?', 'Use the <strong>Forgot Password</strong> link on the login page to reset it with your registered email address.'],
            ['Who do I contact for help?', 'Please see the <a href="/help-centre">Help Centre</a> or the <a href="/contact-us">Contact Us</a> page.'],
        ];

        return collect($qa)->map(fn ($q) => '<h3>' . $q[0] . '</h3><p>' . $q[1] . '</p>')->implode('');
    }
};

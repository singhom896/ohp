<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Content pages the Next.js website links to, managed in
 * CMS Management -> Content (CKEditor):
 *
 *   About Us      menu "About Us"   (/about-us)          slug about-us
 *   Contact Us    menu "Contact Us" (/contact-us)        slug contact-us
 *   Help Centre   new footer menu   (/content/help-centre) slug help-centre
 *
 * Existing menu URLs are left unchanged (the Laravel site keeps its own
 * /about-us and /contact-us pages); the two menus only become "Content" type so
 * a content page can be attached to them. The starter text comes from the
 * site's existing copy and can be edited in the console. Rows that already
 * exist are not touched, so this is safe to run on any environment.
 */
return new class extends Migration
{
    private const CONTENT_TYPE = 2;

    public function up(): void
    {
        $now = now();

        $about = DB::table('menu_items')->where('url', '/about-us')->whereNull('parent_id')->first();
        $contact = DB::table('menu_items')->where('url', '/contact-us')->whereNull('parent_id')->first();

        foreach (array_filter([$about, $contact]) as $menu) {
            DB::table('menu_items')->where('id', $menu->id)->update(['type' => self::CONTENT_TYPE, 'updated_at' => $now]);
        }

        $help = DB::table('menu_items')->where('url', '/content/help-centre')->first();
        if (!$help) {
            $helpId = DB::table('menu_items')->insertGetId([
                'title'       => 'Help Centre',
                'url'         => '/content/help-centre',
                'target'      => '_self',
                'parent_id'   => null,
                'order_index' => (int) DB::table('menu_items')->max('order_index') + 1,
                'is_main'     => false,
                'is_footer'   => true,
                'type'        => self::CONTENT_TYPE,
                'active'      => true,
                'created_at'  => $now,
                'updated_at'  => $now,
            ]);
            $help = DB::table('menu_items')->find($helpId);
        }

        $pages = [
            [$about, 'about-us', 'About Us', $this->aboutHtml()],
            [$contact, 'contact-us', 'Contact Us', $this->contactHtml()],
            [$help, 'help-centre', 'Help Centre', $this->helpHtml()],
        ];

        foreach ($pages as [$menu, $slug, $title, $html]) {
            if (!$menu || DB::table('contents')->where('menu_id', $menu->id)->orWhere('slug', $slug)->exists()) {
                continue;
            }
            DB::table('contents')->insert([
                'menu_id'    => $menu->id,
                'slug'       => $slug,
                'title'      => $title,
                'content'    => $html,
                'is_active'  => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('contents')->whereIn('slug', ['about-us', 'contact-us', 'help-centre'])->delete();
        DB::table('menu_items')->where('url', '/content/help-centre')->delete();
        DB::table('menu_items')->whereIn('url', ['/about-us', '/contact-us'])->whereNull('parent_id')->update(['type' => 1]);
    }

    private function aboutHtml(): string
    {
        return <<<'HTML'
<p><strong>Opportunity Hub for Indian Artists</strong> is a one-stop platform connecting Indian artists with performance opportunities at hotels, weddings, festivals and government programmes across the country.</p>
<h2>A digital platform for registration, accreditation and engagement</h2>
<p>Connecting talent with opportunities &mdash; across India, across art forms, across generations.</p>
<ol>
<li><strong>Register your profile</strong> as an individual artist, a group or an organisation / institute.</li>
<li><strong>Get verified and accredited.</strong></li>
<li><strong>Discover opportunities</strong> that match your art form and location.</li>
<li><strong>Engage and perform</strong> at events, ceremonies and cultural programmes.</li>
<li><strong>Avail scheme benefits.</strong></li>
</ol>
<h2>For organizers</h2>
<p>Hotels, event organizers, institutions and government departments can find the right artists and groups for their events, and connect, communicate and confirm performances in one place.</p>
<p>An initiative of the Ministry of Culture, Government of India.</p>
HTML;
    }

    private function contactHtml(): string
    {
        return <<<'HTML'
<p>For assistance related to registration, artist profiles, opportunities, technical issues and other matters concerning the portal, please contact the teams below.</p>
<h2>Help &amp; Assistance</h2>
<p><strong>Technical Support Team &ndash; Portal Helpdesk</strong><br>Phone: +91-11-2307 8000<br>Monday &ndash; Friday, 9:30 AM &ndash; 6:00 PM (IST)</p>
<h2>Registry Management</h2>
<p><strong>Administrative Secretariat &ndash; Central Administration</strong><br>Central Nodal Officer<br>Ministry of Culture, Government of India</p>
HTML;
    }

    private function helpHtml(): string
    {
        return <<<'HTML'
<h2>Creating your account</h2>
<ol>
<li>Open <a href="/register">Register</a> and choose the account type: <strong>Individual Artist</strong>, <strong>Group (Leader Details)</strong> or <strong>Organisation / Institute</strong>.</li>
<li>Fill in the basic details. Verify your mobile number and email address with the one-time password (OTP) sent to them, when asked.</li>
<li>Create a password of at least 8 characters with both letters and numbers, accept the Terms &amp; Conditions and Privacy Policy, and enter the security code shown.</li>
</ol>
<h2>Signing in</h2>
<p>Use <a href="/login">Login</a> with your registered mobile number or email address and your password. Detailed profile information is completed from your dashboard after you sign in.</p>
<h2>Security code (CAPTCHA)</h2>
<p>Type the characters shown in the image; it is not case-sensitive. If it is hard to read, use the refresh button to get a new one. Each code works once and expires after 5 minutes.</p>
<h2>Need more help?</h2>
<p>Contact the Portal Helpdesk on +91-11-2307 8000 (Monday &ndash; Friday, 9:30 AM &ndash; 6:00 PM IST) or see <a href="/contact-us">Contact Us</a>.</p>
HTML;
    }
};

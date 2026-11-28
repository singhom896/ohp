<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\ZonalCulturalCentre;
use App\Support\ZccScope;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * The 7 Zonal Cultural Centres, their member States / UTs, and one login
 * account (role 8, Zonal Cultural Center) per ZCC.
 *
 * Source: "Brief on ZCCs" and "Details of Officials handling e-Office in ZCCs"
 * (Ministry of Culture). State names below are the names in the `states` table.
 *
 *   php artisan db:seed --class=ZccSeeder
 *
 * Safe to re-run: centres and state mappings are updated in place. An account
 * is created only if none exists for that ZCC; its generated password is
 * printed once. Existing accounts keep their password unless
 * ZCC_RESET_PASSWORDS=true is set.
 */
class ZccSeeder extends Seeder
{
    private const INDIA = 104;

    public const CENTRES = [
        [
            'code' => 'NZCC', 'contact_email' => 'ohp-nzcc@gmail.com', 'name' => 'North Zone Cultural Centre', 'headquarters' => 'Patiala',
            'contact_person' => 'Mrs. Gulshan Kaur', 'contact_designation' => 'Asst. Director Admn',
            'contact_mobile' => '7341121749', 'contact_mobile_alt' => null,
            'states' => ['Himachal Pradesh', 'Haryana', 'Punjab', 'Rajasthan', 'Uttarakhand', 'Jammu And Kashmir', 'Ladakh', 'Chandigarh'],
        ],
        [
            'code' => 'EZCC', 'contact_email' => 'ohp-ezcc@gmail.com', 'name' => 'Eastern Zonal Cultural Centre', 'headquarters' => 'Kolkata',
            'contact_person' => 'Shri Bidyut Sarkar', 'contact_designation' => 'Section Officer',
            'contact_mobile' => '9062959777', 'contact_mobile_alt' => null,
            'states' => ['Assam', 'Bihar', 'Jharkhand', 'Manipur', 'Odisha', 'Sikkim', 'Tripura', 'West Bengal', 'Andaman And Nicobar Islands'],
        ],
        [
            'code' => 'SZCC', 'contact_email' => 'ohp-szcc@gmail.com', 'name' => 'South Zone Cultural Centre', 'headquarters' => 'Thanjavur',
            'contact_person' => 'Shri. Mariappan', 'contact_designation' => 'AAO Estt.',
            'contact_mobile' => '7339031693', 'contact_mobile_alt' => null,
            'states' => ['Andhra Pradesh', 'Karnataka', 'Kerala', 'Telangana', 'Tamil Nadu', 'Andaman And Nicobar Islands', 'Lakshadweep', 'Puducherry'],
        ],
        [
            'code' => 'WZCC', 'contact_email' => 'ohp-wzcc@gmail.com', 'name' => 'West Zone Cultural Centre', 'headquarters' => 'Udaipur',
            'contact_person' => 'Shri Hemant', 'contact_designation' => 'Program Executive',
            'contact_mobile' => '9414162733', 'contact_mobile_alt' => '7976417394',
            'states' => ['Rajasthan', 'Maharashtra', 'Goa', 'Gujarat', 'The Dadra And Nagar Haveli And Daman And Diu'],
        ],
        [
            'code' => 'SCZCC', 'contact_email' => 'ohp-sczcc@gmail.com', 'name' => 'South Central Zone Cultural Centre', 'headquarters' => 'Nagpur',
            'contact_person' => 'Smt. Nisha Pande Bhalerao', 'contact_designation' => 'Jr. Assistant',
            'contact_mobile' => '7385845890', 'contact_mobile_alt' => null,
            'states' => ['Andhra Pradesh', 'Karnataka', 'Madhya Pradesh', 'Maharashtra', 'Chhattisgarh', 'Telangana'],
        ],
        [
            'code' => 'NCZCC', 'contact_email' => 'ohp-nczcc@gmail.com', 'name' => 'North Central Zone Cultural Centre', 'headquarters' => 'Prayagraj',
            'contact_person' => 'Shri Abhinav Rai', 'contact_designation' => 'Assistant (Admin.)',
            'contact_mobile' => '7783987420', 'contact_mobile_alt' => null,
            'states' => ['Uttar Pradesh', 'Madhya Pradesh', 'Bihar', 'Haryana', 'Delhi', 'Rajasthan', 'Uttarakhand'],
        ],
        [
            'code' => 'NEZCC', 'contact_email' => 'ohp-nezcc@gmail.com', 'name' => 'North East Zone Cultural Centre', 'headquarters' => 'Dimapur',
            'contact_person' => 'Shri. S Arennungla Lomkumer', 'contact_designation' => 'AAO',
            'contact_mobile' => '7085917196', 'contact_mobile_alt' => null,
            'states' => ['Arunachal Pradesh', 'Assam', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Sikkim', 'Tripura'],
        ],
    ];

    public function run(): void
    {
        $states = DB::table('states')->get(['id', 'StateName'])->keyBy(fn ($s) => mb_strtolower($s->StateName));
        $regions = DB::table('art_regions')->where('country_id', self::INDIA)->get(['id', 'name'])->keyBy(fn ($r) => mb_strtolower($r->name));
        $reset = filter_var(env('ZCC_RESET_PASSWORDS', false), FILTER_VALIDATE_BOOL);
        $credentials = [];

        DB::transaction(function () use ($states, $regions, $reset, &$credentials) {
            foreach (self::CENTRES as $i => $c) {
                $zcc = ZonalCulturalCentre::query()->updateOrCreate(['code' => $c['code']], collect($c)->except('states')->all() + [
                    'position' => $i + 1, 'status' => 1,
                ]);

                $links = [];
                foreach ($c['states'] as $name) {
                    $state = $states[mb_strtolower($name)] ?? null;
                    if (! $state) {
                        throw new RuntimeException("ZccSeeder: State / UT \"{$name}\" ({$c['code']}) is not in the states table.");
                    }
                    $links[] = ['zcc_id' => $zcc->id, 'state_id' => $state->id, 'region_id' => $regions[mb_strtolower($name)]->id ?? null];
                }
                DB::table('zcc_states')->where('zcc_id', $zcc->id)->delete();
                foreach ($links as $l) {
                    DB::table('zcc_states')->insert($l + ['created_at' => now(), 'updated_at' => now()]);
                }

                $credentials[] = $this->account($zcc, $c, $reset);
            }
        });
        ZccScope::flush();

        $this->command?->info('Zonal Cultural Centres seeded. ZCC login accounts (role: Zonal Cultural Center):');
        $this->command?->table(['ZCC', 'Official', 'Login email', 'Login mobile', 'Password'], $credentials);
        $this->command?->warn('Passwords are shown only when an account is created (or reset). Ask each ZCC to change it after first login.');
    }

    /** One role-8 login per ZCC; login email = the centre's contact_email. */
    private function account(ZonalCulturalCentre $zcc, array $c, bool $reset): array
    {
        $email = mb_strtolower($c['contact_email']);
        $user = User::query()->where('role_id', ZccScope::ROLE)->where('zcc_id', $zcc->id)->orderBy('id')->first()
            ?? User::query()->whereRaw('LOWER(email) = ?', [$email])->first();

        // Login by mobile only works when the number is not shared with another account.
        $mobileTaken = User::query()->where('mobile', $c['contact_mobile'])->when($user, fn ($q) => $q->whereKeyNot($user->id))->exists();
        $mobile = $mobileTaken ? null : $c['contact_mobile'];

        [$first, $last] = $this->splitName($c['contact_person']);
        $password = null;
        $data = [
            'role_id'      => ZccScope::ROLE,
            'zcc_id'       => $zcc->id,
            'country_id'   => self::INDIA,
            'firstname'    => $first,
            'lastname'     => $last,
            'full_name'    => $c['contact_person'],
            'account_name' => "{$c['name']} ({$c['code']})",
            'designation'  => $c['contact_designation'],
            'city'         => $c['headquarters'],
            'active'       => 1,
            'verified_status' => 1,
        ];

        if (! $user) {
            $password = $this->password();
            $user = new User();
            $user->forceFill($data + [
                'email' => $email, 'mobile' => $mobile, 'password' => Hash::make($password), 'created_at' => now(),
            ])->save();
            $user->forceFill(['regno' => generateRegistrationNumber($user->id, ZccScope::ROLE)])->save();
        } else {
            if ($reset) {
                $password = $this->password();
                $data['password'] = Hash::make($password);
            }
            $user->forceFill($data + ['email' => $email, 'mobile' => $user->mobile ?: $mobile])->save();
        }

        return [
            "{$c['code']} ({$c['headquarters']})",
            "{$c['contact_person']}, {$c['contact_designation']}",
            $user->email,
            $user->mobile ?: ($mobileTaken ? "{$c['contact_mobile']} (in use by another account)" : '—'),
            $password ?? '(unchanged)',
        ];
    }

    private function splitName(string $name): array
    {
        $clean = trim(preg_replace('/^(Mrs?\.?|Ms\.?|Smt\.?|Shri\.?|Dr\.?)\s+/i', '', $name));
        $first = Str::before($clean, ' ');

        return [$first, Str::contains($clean, ' ') ? Str::after($clean, ' ') : null];
    }

    /**
     * ZCC_DEFAULT_PASSWORD from .env (kept out of the code / git) when set,
     * else a random one: upper, lower, digit and symbol (portal password rules).
     */
    private function password(): string
    {
        $default = (string) env('ZCC_DEFAULT_PASSWORD', '');

        return $default !== ''
            ? $default
            : 'Zcc@'.Str::upper(Str::random(3)).Str::lower(Str::random(3)).random_int(1000, 9999);
    }
}

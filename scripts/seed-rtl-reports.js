// Dev fixture: insert Farsi/Persian (and Arabic/Hebrew) reports so RTL rendering can be
// checked locally without waiting for a real RTL source to be fetched.
//
// Each fixture targets a specific bidi failure mode — see the `why` field. Together they
// cover the cases that make RTL text look "backwards" to a native reader:
//   - neutral characters (. ! ? : ، «») landing on the wrong visual end of the line
//   - Latin/ASCII digits and words inside an RTL run reordering the run around them
//   - a post whose FIRST strong character is Latin (defeats dir="auto", needs plaintext)
//   - multi-line posts that mix an RTL line and an LTR line in one body
//   - line-clamp / truncation cutting the wrong visual end
//
// _media is "telegramUser" so the frontend takes the plain-text render path
// (SocialMediaPost's default branch) instead of a source-specific parser that
// would need a full rawAPIResponse.
//
//   node scripts/seed-rtl-reports.js            # insert (idempotent — fixed guids)
//   node scripts/seed-rtl-reports.js --remove   # delete them again
//
// Safe to re-run: guids are deterministic, so inserts upsert rather than duplicate.

process.title = 'aggie-seed-rtl-reports';

require('dotenv').config();
const database = require('../backend/database');
const Report = require('../backend/models/report');

const REMOVE = process.argv.includes('--remove');
const GUID_PREFIX = 'rtl-fixture-';

const FIXTURES = [
  {
    key: 'farsi-plain',
    author: 'کاربر آزمایشی',
    why: 'Baseline pure Farsi with sentence-final period — the period should sit on the LEFT edge.',
    content:
      'در پی اعتراضات سراسری، دسترسی به اینترنت در چند استان قطع شد.',
  },
  {
    key: 'farsi-punct',
    author: 'خبر فوری',
    why: 'Question mark, exclamation, Persian comma and guillemets — all neutrals, all commonly misplaced.',
    content:
      'آیا اینترنت قطع شده است؟ بله! گزارش‌ها می‌گویند «قطعی سراسری» است، اما تأیید نشده.',
  },
  {
    key: 'farsi-digits',
    author: 'گزارشگر',
    why: 'ASCII digits + percent inside an RTL run. Digits stay LTR; the surrounding Farsi must not reorder around them.',
    content:
      'در ۲۴ ساعت گذشته ۳ استان و حدود 45% از کاربران تحت تأثیر قرار گرفتند.',
  },
  {
    key: 'farsi-latin-mixed',
    author: 'مانیتور',
    why: 'Latin brand names and an @handle embedded mid-sentence — each needs isolating or the sentence splits visually.',
    content:
      'کاربران Twitter و Instagram از قطعی خبر دادند. منبع: @netblocks و تیم Cloudflare.',
  },
  {
    key: 'farsi-latin-first',
    author: 'NetBlocks',
    why: 'FIRST strong char is Latin, so dir="auto" resolves LTR and the Farsi body stays misaligned. unicode-bidi:plaintext does NOT fix this -- it applies the same first-strong rule per paragraph. Needs content-based detection (utils/textDirection.ts).',
    content:
      'NetBlocks: اینترنت در ایران برای سومین روز متوالی با اختلال شدید مواجه است.',
  },
  {
    key: 'farsi-rt-prefix',
    author: 'Hamidreza',
    why: 'The real-world case: a retweet whose "RT @handle:" prefix is Latin, so first-strong resolves LTR and the prefix renders on the visual LEFT instead of the right. Only content-based detection fixes it.',
    content:
      'RT @MattTheRat_: ازتون میخوام به این رشتوی بسیار مهم افشاگری توجه کنید! فعالیت های شخصی که میخوام بهتون معرفی کنم اثبات میکنه چطور جمهوری اسلامی عمل می‌کند.',
  },
  {
    key: 'english-control',
    author: 'NetBlocks',
    why: 'CONTROL: pure English. Must stay LTR and left-aligned -- if this flips, the direction detector is over-triggering.',
    content:
      'Confirmed: live metrics show Iran has lost connectivity for a third consecutive day. Traffic is down 45% from AS44244. https://netblocks.org/reports #Iran',
  },
  {
    key: 'english-with-farsi-quote',
    author: 'Researcher',
    why: 'CONTROL: mostly English quoting one Farsi word. Must stay LTR -- the RTL run is a small fraction, so the threshold should not flip it.',
    content:
      'The Persian word اینترنت simply means "internet", and it appears in nearly every report we have collected from the region over the past several weeks.',
  },
  {
    key: 'farsi-url',
    author: 'پیوند',
    why: 'A URL is a long LTR run; linkify wraps it in an <a>, which must not break the paragraph direction.',
    content:
      'جزئیات بیشتر در این گزارش: https://netblocks.org/reports/iran-internet-outage منتشر شده است.',
  },
  {
    key: 'farsi-multiline',
    author: 'چند خطی',
    why: 'RTL line, LTR line, then RTL again in one whitespace-pre-wrap body. dir="auto" picks ONE direction for the block; each line needs its own.',
    content:
      'خط اول: قطعی اینترنت در تهران گزارش شد.\nSecond line: outage confirmed by three independent probes.\nخط سوم: وضعیت در حال بررسی است.',
  },
  {
    key: 'farsi-hashtags',
    author: 'هشتگ',
    why: 'Persian hashtags — formatText only matches /#[a-z0-9_]+/ so these are NOT styled. Confirms the regex gap, and that the # stays attached to the right word.',
    content:
      'اعتراضات ادامه دارد #اینترنت_آزاد #ایران و به انگلیسی #IranProtests #Internet',
  },
  {
    key: 'farsi-long-clamp',
    author: 'متن بلند',
    why: 'Long enough to trigger line-clamp in the list view — truncation must cut the END of the sentence (visual left), not the start.',
    content:
      'بر اساس گزارش‌های دریافتی از کاربران در استان‌های تهران، اصفهان، خوزستان و آذربایجان شرقی، ' +
      'دسترسی به شبکه‌های اجتماعی و سرویس‌های پیام‌رسان از ساعات اولیه صبح امروز با اختلال جدی ' +
      'مواجه شده و برخی کاربران گزارش داده‌اند که حتی با استفاده از ابزارهای دور زدن فیلترینگ نیز ' +
      'امکان اتصال وجود ندارد. تیم‌های فنی در حال بررسی ابعاد این قطعی هستند.',
  },
  {
    key: 'arabic-plain',
    author: 'مستخدم تجريبي',
    why: 'Arabic script (not Farsi) — same bidi rules, catches fixes accidentally scoped to Persian only.',
    content: 'انقطاع الإنترنت في عدة محافظات منذ صباح اليوم، والسبب غير معروف.',
  },
  {
    key: 'hebrew-plain',
    author: 'משתמש בדיקה',
    why: 'Hebrew — a second RTL script with no letter-joining, so it isolates bidi bugs from Arabic shaping bugs.',
    content: 'האינטרנט נחתך במספר מחוזות הבוקר, 3 ספקים מדווחים על תקלה.',
  },
];

async function run() {
  if (REMOVE) {
    const res = await Report.deleteMany({
      guid: new RegExp('^' + GUID_PREFIX),
    });
    console.log(`Removed ${res.deletedCount ?? res.n} RTL fixture report(s).`);
    return;
  }

  // Attach to a real source if the local DB has one, so the source column isn't blank.
  const Source = require('../backend/models/source');
  const anySource = await Source.findOne({}).lean();

  const now = new Date();
  let inserted = 0;

  for (const [i, f] of FIXTURES.entries()) {
    // Spread authoredAt over the last few hours so the default sort interleaves them.
    const authoredAt = new Date(now.getTime() - (i + 1) * 11 * 60 * 1000);
    const guid = GUID_PREFIX + f.key;

    const doc = {
      guid,
      content: f.content,
      author: f.author,
      authoredAt,
      fetchedAt: now,
      storedAt: now,
      url: 'https://example.org/rtl-fixture/' + f.key,
      content_lang: f.key.startsWith('arabic')
        ? 'ar'
        : f.key.startsWith('hebrew')
        ? 'he'
        : 'fa',
      _media: ['telegramUser'],
      _sources: anySource ? [String(anySource._id)] : [],
      _sourceNicknames: anySource ? [anySource.nickname] : ['rtl-fixture'],
      metadata: {
        accountHandle: f.author,
        accountUrl: 'https://example.org/rtl-fixture/account',
        // Empty object rather than undefined: the plain-text render path doesn't
        // parse it, but other code paths do `report.metadata.rawAPIResponse?.x`.
        rawAPIResponse: {},
        rtlFixtureNote: f.why,
      },
      hasSMTCTags: false,
      closed: false,
      read: false,
      escalated: false,
      irrelevant: 'maybe',
      veracity: 'Unconfirmed',
    };

    await Report.updateOne({ guid }, { $set: doc }, { upsert: true });
    inserted++;
    console.log(`  ${f.key.padEnd(20)} ${f.why}`);
  }

  console.log(`\nUpserted ${inserted} RTL fixture report(s).`);
  console.log('Remove them again with: node scripts/seed-rtl-reports.js --remove');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

# Local Social Video Engine

מנוע מקומי ליצירת וידאו מודעות בסגנון slideshow ללא שום חיבור לצד שלישי.

## מה המנוע יודע לעשות
- קורא קובץ JSON של עבודה
- בונה timeline אוטומטי
- מציג תמונות עם אנימציית Ken Burns
- מוסיף כותרת, טקסט משני, CTA ולוגו
- מצמיד מוסיקת רקע מקומית
- מייצא MP4 מותאם לפלטפורמה

## מתאים ל
- TikTok / Reels / Facebook Feed
- נדל"ן, פרויקטים, מוצרים, מודעות showcase
- עבודה מתוך VS Code עם Claude Code

## התקנה
```bash
npm install
```

## עבודה ראשונה
1. שים תמונות ב-`assets/samples/`
2. שים לוגו ב-`assets/logos/`
3. שים מוסיקה ב-`assets/music/`
4. עדכן את `jobs/sample-he.json`
5. הרץ:
```bash
npm run render:sample
```

## הרצה גנרית
```bash
npm run render -- jobs/sample-he.json output/out.mp4
```

## עבודה ב-Studio
```bash
npm run dev
```

## מבנה לוגי
- `src/engine/loadJob.ts` — טעינת וולידציה של job JSON
- `src/engine/planner.ts` — בניית timeline
- `src/templates/SlideshowAd.tsx` — תבנית הווידאו הראשית
- `src/components/` — רכיבי שקופיות, טקסט, לוגו
- `scripts/render.ts` — פקודת render בפועל

## הערות
- המנוע לא משתמש בשום API חיצוני
- הבחירה במוסיקה היא מקומית בלבד
- התבנית הראשונה ממוקדת ב-vertical ads
- מומלץ להחליף את קבצי הדוגמה בנכסים אמיתיים לפני render

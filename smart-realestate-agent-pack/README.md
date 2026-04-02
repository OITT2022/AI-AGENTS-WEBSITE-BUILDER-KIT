# Smart Real Estate Agent Pack

תיקיית בסיס מוכנה ל-VS Code כדי לשלב סוכן חכם במערכת נדל"ן קיימת.

החבילה כוללת:
- שלד TypeScript מסודר
- Orchestrator לסוכן החכם
- חיבורי Provider מופרדים לנתוני נכסים, Claude, Canva, Nano Banana ו-Shotstack
- API מקומי להפעיל יצירת מודעה לפי `propertyId`
- קבצי Claude Code: `CLAUDE.md` ופקודת Slash
- דוגמאות ל-Prompts, תבניות, וזרימת אינטגרציה

## מה הסוכן עושה
1. מושך נתוני נכס מהמערכת הקיימת
2. מייצר טקסט שיווקי בעזרת Claude
3. מעבד תמונה/תמונות בעזרת שירות עריכת תמונה חיצוני
4. יוצר וידאו קצר לנכס
5. מעלה Assets ל-Canva
6. ממלא תבנית קיימת
7. מחזיר פלט מוכן להפצה או מפרסם דרך Webhook למערכת שלך

## התקנה
```bash
npm install
cp .env.example .env
npm run dev
```

## בדיקה מהירה
```bash
curl -X POST http://localhost:4020/agent/create-ad \
  -H "Content-Type: application/json" \
  -d '{"propertyId":"12345","channel":"instagram"}'
```

## שילוב במערכת הקיימת
הדרך הפשוטה ביותר:
1. להעתיק את התיקייה הזו לריפו הקיים שלך תחת `tools/smart-agent` או `services/smart-agent`
2. לעדכן ב-`.env` את כתובות ה-API האמיתיות
3. לחבר את `src/infra/property_api/PropertyApiClient.ts` אל ה-endpoints הקיימים שלך
4. לחבר את `src/infra/canva/CanvaClient.ts` ל-template IDs האמיתיים שלך
5. להחליף את `NanoBananaClient` ל-wrapper/SDK האמיתי שבו תשתמש
6. להפעיל מתוך Claude Code דרך פקודת slash המצורפת

## קבצים חשובים
- `src/application/AdGenerationOrchestrator.ts` — הלב של הסוכן
- `src/api/server.ts` — API מקומי להפעלה
- `.claude/commands/create-ad.md` — פקודת Claude Code
- `CLAUDE.md` — הקשר קבוע לפרויקט
- `docs/INTEGRATION_GUIDE.md` — הוראות חיבור מפורטות
- `examples/sample-property.json` — דוגמת קלט

## הערה חשובה
זהו שלד אינטגרציה אמיתי אבל גנרי. הוא לא מכיל את מפתחות ה-API שלך ולא מניח מבנה קשיח של המערכת הקיימת. תצטרך להתאים כמה שכבות חיבור כדי שישתלב 1:1 במערכת שלך.

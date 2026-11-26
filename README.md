# פסיכו פאנטזי

סיכומים, לייב, פלאנר ותמונות לווטסאפ לליגת ה-FPL "Psychopaths" (1682077).

## איך זה עובד

- `index.html` – כל האתר בקובץ אחד.
- `curated.json` – הטקסטים שנכתבו ביד: כינויים, כותרות, עקיצות, סיפורי המחזור, הארכיון. זה הקובץ היחיד שעורכים בשביל תוכן.
- `sw.js` – מאפשר לאתר להיפתח מהר ולעבוד גם בלי חיבור (מציג את הנתונים האחרונים).
- `update.mjs` – בונה את `data.json` מה-API הציבורי של FPL, ומלביש עליו את `curated.json`.
- `.github/workflows/site.yml` – בונה ומפרסם ל-GitHub Pages:
  - בכל push ל-`main`;
  - כל חצי שעה, אבל רק כשמשהו יכול להשתנות: משחק בזמן אמת, השעות סביב הדדליין, או אם עברו 3 שעות מהבנייה האחרונה. בשאר הריצות היא נגמרת תוך שניות;
  - ידנית: Actions ← build and deploy ← Run workflow.

`data.json` לא נשמר בריפו. הוא נבנה מחדש בכל פרסום, כך שההיסטוריה של הריפו נשארת נקייה.

## פרטיות

- כל הנתונים ציבוריים ב-API של FPL. אין בריפו סיסמאות, טוקנים או התחברות לחשבון.
- שמות אמיתיים של מאמנים לא נכנסים לאתר. רק כינויים ושמות קבוצות.
- טיוטות הפלאנר נשמרות רק בדפדפן של כל משתמש (localStorage).
- האתר מסומן `noindex`, כך שמנועי חיפוש לא מציגים אותו.

## הגדרה חד-פעמית

Settings ← Pages ← Build and deployment ← Source: **GitHub Actions**.

## הרצה מקומית

```
node update.mjs _site   # צריך גישה ל-fantasy.premierleague.com
cp -r index.html manifest.webmanifest robots.txt sw.js assets _site/
cd _site && python3 -m http.server 8765
```

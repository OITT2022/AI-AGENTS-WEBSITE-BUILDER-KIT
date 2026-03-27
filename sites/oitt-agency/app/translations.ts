export type Locale = "he" | "en";

export const translations = {
  he: {
    dir: "rtl" as const,
    nav: {
      home: "ראשי",
      services: "שירותים",
      portfolio: "עבודות",
      about: "אודות",
      contact: "צור קשר",
    },
    hero: {
      title: "סוכנות הדיגיטל",
      highlight: "שלך",
      subtitle:
        "אנחנו בונים חוויות דיגיטליות שמניעות צמיחה. עיצוב, פיתוח ושיווק — הכל תחת קורת גג אחת.",
      cta: "בואו נדבר",
      secondary: "הפרויקטים שלנו",
    },
    services: {
      title: "השירותים שלנו",
      subtitle: "פתרונות דיגיטליים מקצה לקצה שמותאמים לעסק שלך",
      items: [
        {
          icon: "🌐",
          title: "בניית אתרים",
          desc: "אתרים מהירים, רספונסיביים ומותאמי SEO עם עיצוב מודרני ונגיש.",
        },
        {
          icon: "📱",
          title: "אפליקציות ווב",
          desc: "מערכות ניהול, דשבורדים ואפליקציות מתקדמות בטכנולוגיות החדשות.",
        },
        {
          icon: "🎨",
          title: "עיצוב UI/UX",
          desc: "חוויית משתמש מדויקת ועיצוב ויזואלי שמחבר את המותג לקהל.",
        },
        {
          icon: "📈",
          title: "שיווק דיגיטלי",
          desc: "קידום אורגני, ממומן וניהול רשתות חברתיות עם תוצאות מדידות.",
        },
        {
          icon: "🛒",
          title: "חנויות אונליין",
          desc: "חנויות מקוונות עם חוויית קניה חלקה, תשלומים ומערכות משלוח.",
        },
        {
          icon: "🔧",
          title: "תחזוקה ותמיכה",
          desc: "תמיכה שוטפת, עדכונים, אבטחה וגיבויים כדי שהעסק ירוץ בלי דאגות.",
        },
      ],
    },
    portfolio: {
      title: "הפרויקטים שלנו",
      subtitle: "מבחר עבודות אחרונות שביצענו עבור לקוחותינו",
      items: [
        { title: "חנות אופנה", category: "E-Commerce", color: "#6366f1" },
        { title: "אפליקציית ניהול", category: "Web App", color: "#06b6d4" },
        { title: "אתר תדמית — משרד עו״ד", category: "Corporate", color: "#8b5cf6" },
        { title: "פלטפורמת הזמנות", category: "SaaS", color: "#ec4899" },
        { title: "פורטל חדשות", category: "Media", color: "#f59e0b" },
        { title: "דף נחיתה — סטארטאפ", category: "Landing Page", color: "#10b981" },
      ],
    },
    about: {
      title: "למה OITT?",
      subtitle: "אנחנו לא רק בונים אתרים — אנחנו בונים הצלחה דיגיטלית",
      stats: [
        { value: "150+", label: "פרויקטים" },
        { value: "8+", label: "שנות ניסיון" },
        { value: "98%", label: "שביעות רצון" },
        { value: "24/7", label: "זמינות תמיכה" },
      ],
      description:
        "צוות OITT מורכב ממומחים בפיתוח, עיצוב ושיווק דיגיטלי. אנחנו מלווים את הלקוחות שלנו מהרעיון ועד להשקה, עם דגש על איכות, ביצועים ותוצאות.",
    },
    contact: {
      title: "צור קשר",
      subtitle: "נשמח לשמוע מכם ולדון בפרויקט הבא שלכם",
      name: "שם מלא",
      email: "אימייל",
      phone: "טלפון",
      message: "ספרו לנו על הפרויקט",
      send: "שלח הודעה",
      sending: "שולח...",
      success: "ההודעה נשלחה בהצלחה! נחזור אליכם בהקדם.",
      error: "שגיאה בשליחה, נסו שוב.",
    },
    footer: {
      tagline: "סוכנות דיגיטל מובילה — עיצוב, פיתוח ושיווק.",
      rights: "כל הזכויות שמורות",
    },
  },
  en: {
    dir: "ltr" as const,
    nav: {
      home: "Home",
      services: "Services",
      portfolio: "Portfolio",
      about: "About",
      contact: "Contact",
    },
    hero: {
      title: "Your Digital",
      highlight: "Agency",
      subtitle:
        "We build digital experiences that drive growth. Design, development, and marketing — all under one roof.",
      cta: "Let's Talk",
      secondary: "Our Work",
    },
    services: {
      title: "Our Services",
      subtitle: "End-to-end digital solutions tailored to your business",
      items: [
        {
          icon: "🌐",
          title: "Web Development",
          desc: "Fast, responsive, SEO-optimized websites with modern and accessible design.",
        },
        {
          icon: "📱",
          title: "Web Applications",
          desc: "Management systems, dashboards, and advanced apps with cutting-edge tech.",
        },
        {
          icon: "🎨",
          title: "UI/UX Design",
          desc: "Precise user experience and visual design that connects your brand to your audience.",
        },
        {
          icon: "📈",
          title: "Digital Marketing",
          desc: "Organic and paid promotion, social media management with measurable results.",
        },
        {
          icon: "🛒",
          title: "E-Commerce",
          desc: "Online stores with seamless shopping experiences, payments, and shipping.",
        },
        {
          icon: "🔧",
          title: "Maintenance & Support",
          desc: "Ongoing support, updates, security, and backups to keep your business running.",
        },
      ],
    },
    portfolio: {
      title: "Our Portfolio",
      subtitle: "A selection of recent projects we've delivered for our clients",
      items: [
        { title: "Fashion Store", category: "E-Commerce", color: "#6366f1" },
        { title: "Management App", category: "Web App", color: "#06b6d4" },
        { title: "Law Firm Website", category: "Corporate", color: "#8b5cf6" },
        { title: "Booking Platform", category: "SaaS", color: "#ec4899" },
        { title: "News Portal", category: "Media", color: "#f59e0b" },
        { title: "Startup Landing Page", category: "Landing Page", color: "#10b981" },
      ],
    },
    about: {
      title: "Why OITT?",
      subtitle: "We don't just build websites — we build digital success",
      stats: [
        { value: "150+", label: "Projects" },
        { value: "8+", label: "Years Experience" },
        { value: "98%", label: "Satisfaction" },
        { value: "24/7", label: "Support" },
      ],
      description:
        "The OITT team is composed of experts in development, design, and digital marketing. We accompany our clients from idea to launch, with emphasis on quality, performance, and results.",
    },
    contact: {
      title: "Get in Touch",
      subtitle: "We'd love to hear from you and discuss your next project",
      name: "Full Name",
      email: "Email",
      phone: "Phone",
      message: "Tell us about your project",
      send: "Send Message",
      sending: "Sending...",
      success: "Message sent successfully! We'll get back to you soon.",
      error: "Error sending message, please try again.",
    },
    footer: {
      tagline: "Leading digital agency — design, development, and marketing.",
      rights: "All rights reserved",
    },
  },
} as const;

/**
 * ALL user-facing texts of the app (English).
 * To translate: copy this file to pt.ts, translate the values (keep the keys and
 * function signatures), then register it in ./index.ts.
 */
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const en = {
  locale: "en-GB",

  common: {
    appName: "Spanish with María",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    close: "Close",
    back: "Back",
    signOut: "Sign out",
    error: "Something went wrong. Please try again.",
    notAllowed: "You are not allowed to do this.",
    credits: (n: number) => `${n} ${plural(n, "credit", "credits")}`,
    timezoneNote: (tz: string) => `All times are shown in ${tz.replace(/_/g, " ")} time.`,
    phone: "Phone",
    email: "Email",
    name: "Name",
    call: "Call",
    sendEmail: "Send email",
  },

  nav: {
    blog: "Blog",
    about: "About me",
    testimonials: "Testimonials",
    contact: "Contact",
    login: "Student login",
  },

  landing: {
    hero: {
      badge: "Online & in-person Spanish lessons",
      title: "Speak Spanish with confidence — from your very first lesson",
      subtitle:
        "Friendly, personalised lessons with an experienced native teacher. Learn at your own pace, for travel, work, exams or simply for the joy of it.",
      ctaPrimary: "Start learning today",
      ctaSecondary: "Meet your teacher",
    },
    about: {
      title: "Meet your teacher",
      role: "Native Spanish teacher · 20+ years of experience",
      paragraphs: [
        "¡Hola! I'm María. I was born in Salamanca, Spain, and I have been teaching Spanish for more than twenty years. In that time I have had the joy of guiding over a thousand students — from complete beginners to busy professionals — towards speaking Spanish with confidence.",
        "My lessons are warm, patient and built around you. We speak from the very first day, and grammar and vocabulary come naturally, step by step. Whether you are preparing for a trip, an exam (DELE / SIELE), a new job, or want to connect with Spanish-speaking family and friends, we will create a plan around your goals.",
        "I believe learning a language should feel like a conversation between friends: relaxed, encouraging and full of laughter. I can't wait to meet you!",
      ],
      stats: [
        { value: "20+", label: "years of teaching" },
        { value: "1,000+", label: "happy students" },
        { value: "A1–C2", label: "all levels" },
      ],
    },
    testimonials: {
      title: "What my students say",
      items: [
        {
          quote:
            "After years of apps that never stuck, María finally got me speaking. Her lessons are structured but always fun — I had my first real conversation in Spanish after just two months.",
          name: "Sarah T.",
          detail: "From beginner to B1",
        },
        {
          quote:
            "I passed my DELE B2 exam on the first try thanks to María's clear explanations and endless patience. She knows exactly where students struggle and how to help.",
          name: "João P.",
          detail: "DELE B2 exam preparation",
        },
        {
          quote:
            "María adapts every class to my schedule and my goals. My meetings with clients in Madrid are now in Spanish — and they notice the difference!",
          name: "Daniel K.",
          detail: "Business Spanish",
        },
      ],
    },
    contact: {
      title: "Contact us to start learning",
      subtitle:
        "Tell me a little about yourself and your goals. I will get back to you within 48 hours to plan your first lesson.",
      name: "Your name",
      email: "Your email",
      phone: "Your phone number",
      message: "Short message",
      messagePlaceholder: "e.g. I'm a beginner and I want to travel to Spain next summer.",
      submit: "Send my request",
      sending: "Sending…",
      success: "Thank you! Your message has been sent. I will contact you very soon.",
      errors: {
        name: "Please enter your name.",
        email: "Please enter a valid email address.",
        phone: "This phone number is too long.",
        message: "Your message is too long (2,000 characters maximum).",
      },
    },
    footer: {
      rights: (year: number) => `© ${year} Spanish with María. All rights reserved.`,
    },
  },

  login: {
    title: "Welcome back",
    subtitle: "Log in to book your lessons.",
    email: "Email",
    password: "Password",
    submit: "Log in",
    submitting: "Logging in…",
    error: "Wrong email or password. Please try again.",
    inactive: "Your account is paused. Please contact your teacher.",
    noProfile: "Your account is not fully set up yet. Please contact your teacher.",
    forgot: "Forgot your password?",
    backHome: "← Back to the website",
  },

  admin: {
    title: "Teacher space",
    nav: {
      contacts: "New contacts",
      students: "My students",
      schedule: "My schedule",
      messages: "Messages",
      website: "View my website",
    },

    contacts: {
      title: "New contacts",
      intro: "People who want to start learning with you. Click the green button to give them a student account.",
      empty: "No new contacts for now. 🌿",
      received: (date: string) => `Received on ${date}`,
      autoDelete: (days: number) =>
        `Will be deleted automatically in ${days} ${plural(days, "day", "days")} if no account is created.`,
      noMessage: "(No message)",
      createAccount: "Create student account",
      creating: "Creating account…",
      created: (name: string) => `Done! ${name} is now your student. A secure activation link was sent by email.`,
      emailExists: "A student account already exists with this email.",
      remove: "Remove",
      removeConfirm: (name: string) => `Remove ${name} from the list? This cannot be undone.`,
      removed: "Contact removed.",
    },

    students: {
      title: "My students",
      intro: "Click a student's name to see and edit their details.",
      empty: "You have no students yet. Create one from “New contacts”.",
      search: "Search a student",
      openProfile: "Open profile",
      creditsLeft: "Lessons left",
      inactiveTitle: "Paused students",
      paused: "Paused",
    },

    credits: {
      label: "Prepaid lessons",
      amount: "How many?",
      add: "Add",
      remove: "Remove",
      updated: (n: number) => `Saved. Now: ${n} ${plural(n, "lesson", "lessons")}.`,
    },

    studentDetail: {
      back: "← Back to my students",
      editTitle: "Student details",
      fullName: "Full name",
      email: "Email (used to log in)",
      phone: "Phone",
      objectives: "Learning objectives",
      notes: "My private notes (the student cannot see this)",
      active: "Active student (can book lessons)",
      saved: "Changes saved.",
      upcoming: "Next lessons",
      noUpcoming: "No lessons booked.",
      resetPassword: "Send an account access link",
      resetPasswordConfirm: "Send a secure activation or password reset link to this student?",
      resetPasswordDone: "A secure account access link was sent by email.",
      notFound: "Student not found.",
    },

    schedule: {
      title: "My schedule",
      tabs: {
        lessons: "My lessons",
        hours: "Weekly hours",
        daysOff: "Days off",
      },
      lessons: {
        intro: "Click a lesson to see the student.",
        previousWeek: "← Previous week",
        nextWeek: "Next week →",
        thisWeek: "This week",
        noLessons: "No lessons",
        weekOf: (label: string) => `Week of ${label}`,
      },
      hours: {
        intro: "Turn on the days you work and choose your hours. Then press “Save”.",
        working: "I work",
        notWorking: "Day off",
        from: "From",
        to: "To",
        saved: "Your weekly hours are saved.",
        invalid: (day: string) => `${day}: the end time must be after the start time.`,
      },
      daysOff: {
        intro: "Click a day in the calendar to block it (holidays, appointments…).",
        previousMonth: "← Previous month",
        nextMonth: "Next month →",
        selectDay: "Click a day in the calendar.",
        blockWholeDay: "I cannot work this day",
        unblockWholeDay: "Make this day available again",
        wholeDayBlocked: "This whole day is blocked.",
        orBlockHours: "Or block only some hours (click to block / unblock):",
        notWorkingDay: "You don't work on this weekday (see “Weekly hours”).",
        blocked: "Blocked",
        free: "Free",
        hasLessons: (n: number) =>
          `⚠️ ${n} ${plural(n, "lesson is", "lessons are")} booked this day. Blocking does not cancel ${plural(n, "it", "them")} — cancel from “My lessons” if needed.`,
        upcomingTitle: "My upcoming days off",
        none: "No days off planned.",
        wholeDay: "Whole day",
        unblock: "Remove",
        past: "This day is in the past.",
      },
    },

    lessonModal: {
      title: "Lesson",
      student: "Student",
      objectives: "Learning objectives",
      noObjectives: "No objectives written yet.",
      cancelClass: "Cancel this class",
      cancelTitle: "Cancel this class?",
      cancelHelp: "Write a short message for the student. They will receive it by email and get their lesson credit back.",
      cancelPlaceholder: "e.g. I'm sorry, I am sick today. Let's book another day!",
      confirmCancel: "Yes, cancel the class",
      cancelling: "Cancelling…",
      keep: "No, keep the class",
      cancelled: "The class was cancelled. The student got 1 credit back and was informed by email.",
      messageRequired: "Please write a short message for the student.",
    },

    messages: {
      title: "Messages from students",
      empty: "No messages yet.",
      from: (name: string) => `From ${name}`,
      reply: "Reply by email",
    },
  },

  dashboard: {
    nav: {
      book: "Book a lesson",
      profile: "My profile",
      contact: "Contact my teacher",
    },
    hello: (name: string) => `Hello, ${name}!`,
    creditsBadge: (n: number) => `You have ${n} ${plural(n, "lesson", "lessons")} left`,

    booking: {
      title: "Book a lesson",
      intro: "1. Choose a day.  2. Choose a time.  3. Confirm.",
      noCredits: "You have no lessons left. Please contact your teacher to buy more.",
      chooseDay: "Choose a day",
      chooseTime: "Choose a time",
      noSlotsDay: "No free times this day.",
      noSlots: "There are no free times at the moment. Please check again later.",
      confirmTitle: "Confirm your lesson",
      confirmText: (when: string) => `Book a lesson on ${when}? This will use 1 lesson credit.`,
      confirm: "Yes, book it",
      booking: "Booking…",
      success: "Your lesson is booked! See you soon. 🎉",
      errors: {
        NO_CREDITS: "You have no lessons left. Please contact your teacher.",
        SLOT_NOT_AVAILABLE: "Sorry, this time is no longer available. Please choose another one.",
        NOT_ALLOWED: "Your account cannot book lessons right now. Please contact your teacher.",
      } as Record<string, string>,
      myLessons: "My next lessons",
      noLessons: "You have no lessons booked yet.",
      cancelledByTeacher: "Cancelled by your teacher",
    },

    profile: {
      title: "My profile",
      fullName: "Full name",
      email: "Email (to change it, ask your teacher)",
      phone: "Phone",
      objectives: "My learning objectives",
      objectivesHelp: "What do you want to achieve? (travel, exam, work, conversation…)",
      saved: "Your profile is saved.",
      passwordTitle: "Change my password",
      newPassword: "New password (at least 8 characters)",
      confirmPassword: "Repeat the new password",
      passwordSave: "Change password",
      passwordSaved: "Your password was changed.",
      passwordTooShort: "The password must have at least 8 characters.",
      passwordMismatch: "The two passwords are not the same.",
    },

    contact: {
      title: "Contact my teacher",
      emailLabel: "Teacher's email",
      formTitle: "Send a message",
      message: "Your message",
      send: "Send message",
      sending: "Sending…",
      sent: "Your message was sent. Your teacher will answer you soon.",
      empty: "Please write a message.",
    },
  },

  emails: {
    newContact: {
      subject: (name: string) => `New contact request from ${name}`,
      body: (c: { name: string; email: string; phone: string; message: string }) =>
        `Someone wants to learn Spanish with you!\n\nName: ${c.name}\nEmail: ${c.email}\nPhone: ${c.phone || "-"}\n\nMessage:\n${c.message || "-"}\n\nOpen your teacher space to create their student account.`,
    },
    credentials: {
      subject: "Your Spanish lessons account is ready",
      body: (p: { name: string; email: string; url: string }) =>
        `Hello ${p.name},\n\nWelcome! Your student account is ready.\n\nActivate your account and choose your password:\n${p.url}\n\nYour login email: ${p.email}\n\nThis link expires and can only be used once. Then sign in using your email and password. Never share the link or your password.\n\n¡Hasta pronto!`,
    },
    passwordReset: {
      subject: "Reset your Spanish lessons password",
      body: (p: { name: string; email: string; url: string }) =>
        `Hello ${p.name},\n\nUse this secure link to choose a new password:\n${p.url}\n\nThis link expires and can only be used once. Never share it. If you did not request this change, you can ignore this email.\n\n¡Hasta pronto!`,
    },
    cancellation: {
      subject: (when: string) => `Your Spanish lesson on ${when} is cancelled`,
      body: (p: { name: string; when: string; message: string }) =>
        `Hello ${p.name},\n\nYour lesson on ${p.when} has been cancelled by your teacher.\n\nMessage from your teacher:\n"${p.message}"\n\nYour lesson credit has been given back. You can book a new lesson at any time.\n\n¡Hasta pronto!`,
    },
    bookingConfirmation: {
      subject: (when: string) => `Lesson booked: ${when}`,
      body: (p: { name: string; when: string }) =>
        `Hello ${p.name},\n\nYour Spanish lesson on ${p.when} is booked.\n\n¡Hasta pronto!`,
    },
    teacherNewBooking: {
      subject: (name: string, when: string) => `New lesson: ${name} – ${when}`,
      body: (p: { name: string; when: string }) => `${p.name} booked a lesson on ${p.when}.`,
    },
    studentMessage: {
      subject: (name: string) => `New message from ${name}`,
      body: (p: { name: string; email: string; message: string }) =>
        `${p.name} (${p.email}) sent you a message:\n\n${p.message}`,
    },
  },
};

export type Dictionary = typeof en;

export const starterPoems = [
  {
    id: "window-light",
    title: "window light",
    owner: "mine",
    mood: "hopeful",
    tags: ["rain", "healing", "morning"],
    date: "03 oct 2026",
    source: "written after the rain",
    lines: [
      "The night left its blue on the window,",
      "and morning came carrying a little gold.",
      "I did not call it healing yet,",
      "but I let it sit beside me."
    ],
    devanagari: [
      "रात ने खिड़की पर अपना नीला छोड़ दिया,",
      "सुबह थोड़ी-सी सुनहरी धूप लेकर आई।",
      "मैंने इसे अभी मरहम नहीं कहा,",
      "बस इसे अपने पास बैठने दिया।"
    ],
    urdu: [
      "رات نے کھڑکی پر اپنا نیلا چھوڑ دیا،",
      "صبح تھوڑی سی سنہری دھوپ لے کر آئی۔",
      "میں نے اسے ابھی مرہم نہیں کہا،",
      "بس اسے اپنے پاس بیٹھنے دیا۔"
    ]
  },
  {
    id: "the-last-train",
    title: "the last train home",
    owner: "mine",
    mood: "restless",
    tags: ["night", "train", "silence"],
    date: "29 sep 2026",
    source: "11:58 pm · platform three",
    lines: [
      "The last train knew my name,",
      "it kept one blue seat warm.",
      "I carried all my unsaid things,",
      "and called the silence home."
    ],
    devanagari: [
      "आख़िरी ट्रेन मेरा नाम जानती थी,",
      "उसने एक नीली सीट गरम रखी।",
      "मैं अपने सारे अनकहे शब्द लिए चला,",
      "और ख़ामोशी को घर कह दिया।"
    ],
    urdu: [
      "آخری ٹرین میرا نام جانتی تھی،",
      "اس نے ایک نیلی نشست گرم رکھی۔",
      "میں اپنے سارے ان کہے لفظ لیے چلا،",
      "اور خاموشی کو گھر کہہ دیا۔"
    ]
  },
  {
    id: "borrowed-sun",
    title: "borrowed sun",
    owner: "collected",
    mood: "tender",
    tags: ["friendship", "warmth", "memory"],
    date: "found 17 aug 2026",
    source: "from a friend’s notebook",
    poet: "A friend, unnamed",
    whySaved: "It made friendship feel like a room that stays warm after someone leaves.",
    lines: [
      "Some people arrive like borrowed sunlight,",
      "warm enough to show you your own hands.",
      "When they leave, the room is still a room,",
      "but you remember where the gold had been."
    ],
    devanagari: [
      "कुछ लोग उधार की धूप की तरह आते हैं,",
      "इतनी गर्म कि अपने हाथ दिख जाएँ।",
      "उनके जाने पर कमरा कमरा ही रहता है,",
      "बस याद रहता है सोना कहाँ था।"
    ],
    urdu: [
      "کچھ لوگ ادھار کی دھوپ کی طرح آتے ہیں،",
      "اتنے گرم کہ اپنے ہاتھ دکھائی دیں۔",
      "ان کے جانے پر کمرہ کمرہ ہی رہتا ہے،",
      "بس یاد رہتا ہے سونا کہاں تھا۔"
    ]
  }
];

export const starterSnippets = [
  { id: "midnight", title: "at 3:17, the sky softened", time: "03:17 am · restless", mood: "restless", tags: ["night", "sky"], symbol: "☾", poemId: "the-last-train", x: 0.65, y: 0.34 },
  { id: "train", title: "a blue seat kept waiting", time: "11:58 pm · restless", mood: "restless", tags: ["train", "waiting"], symbol: "↗", poemId: "the-last-train", x: 0.78, y: 0.46 },
  { id: "marigold", title: "someone left marigolds at the door", time: "08:04 am · tender", mood: "tender", tags: ["marigold", "home"], symbol: "✽", poemId: "borrowed-sun", x: 0.64, y: 0.71 },
  { id: "window", title: "let the light sit beside you", time: "06:42 am · hopeful", mood: "hopeful", tags: ["light", "morning"], symbol: "☼", poemId: "window-light", x: 0.8, y: 0.66 },
  { id: "new", title: "a thought waiting to be named", time: "just now · tender", mood: "tender", tags: [], symbol: "✦", poemId: "window-light", x: 0.52, y: 0.58 }
];

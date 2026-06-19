export const quizSettings = {
  schoolName: "Online Quiz Portal",
  durationMinutes: 15,
  allowScoreReview: true
};

export const students = [
  { name: "Ada Okafor", serial: "QZ-001" },
  { name: "Tunde Bello", serial: "QZ-002" },
  { name: "Mariam Yusuf", serial: "QZ-003" },
  { name: "Chinedu Obi", serial: "QZ-004" }
];

export const subjects = [
  {
    id: "mathematics",
    title: "Mathematics",
    accent: "bg-indigo-600",
    questions: [
      {
        question: "What is the value of 12 x 8?",
        options: ["88", "96", "108", "112"],
        answer: "96"
      },
      {
        question: "Simplify 3/6 to its lowest term.",
        options: ["1/2", "1/3", "2/3", "3/2"],
        answer: "1/2"
      },
      {
        question: "What is the perimeter of a square with side 7 cm?",
        options: ["14 cm", "21 cm", "28 cm", "49 cm"],
        answer: "28 cm"
      },
      {
        question: "Solve: 15 + 6 - 4.",
        options: ["13", "15", "17", "21"],
        answer: "17"
      },
      {
        question: "Which number is an even number?",
        options: ["19", "25", "32", "47"],
        answer: "32"
      }
    ]
  },
  {
    id: "english",
    title: "English Language",
    accent: "bg-emerald-600",
    questions: [
      {
        question: "Choose the correct spelling.",
        options: ["Recieve", "Receive", "Receeve", "Receve"],
        answer: "Receive"
      },
      {
        question: "What is the plural of child?",
        options: ["Childs", "Children", "Childes", "Childrens"],
        answer: "Children"
      },
      {
        question: "Identify the verb: The students answered quickly.",
        options: ["students", "answered", "quickly", "the"],
        answer: "answered"
      },
      {
        question: "Choose the opposite of ancient.",
        options: ["Old", "Modern", "Former", "Past"],
        answer: "Modern"
      },
      {
        question: "Select the correct sentence.",
        options: [
          "She go to school daily.",
          "She goes to school daily.",
          "She going to school daily.",
          "She gone to school daily."
        ],
        answer: "She goes to school daily."
      }
    ]
  }
];

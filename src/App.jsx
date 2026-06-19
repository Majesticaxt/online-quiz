import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  Download,
  FileUp,
  GraduationCap,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  LogIn,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound
} from "lucide-react";
import { quizSettings, subjects as seedSubjects } from "./quizData";
import {
  clearStoredAttempts,
  loadQuizData,
  saveAttempt,
  saveStudents,
  saveSubjects
} from "./firebaseBackend";

const STUDENTS_KEY = "online-quiz-students-v2";
const SUBJECTS_KEY = "online-quiz-subjects-v2";
const ATTEMPTS_KEY = "online-quiz-attempts-v2";
const SETTINGS_KEY = "online-quiz-settings-v1";
const ADMIN_SESSION_KEY = "online-quiz-admin-session-v1";
const ADMIN_CODE = "TEACHER2026";

function normalize(value) {
  return value.trim().toLowerCase();
}

function slugify(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function shuffle(items) {
  return [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function scoreQuiz(questions, answers) {
  return questions.reduce((total, question, index) => {
    const correctAnswer = resolveAnswer(question.answer || "", question.options || []);
    return total + (normalize(answers[index] || "") === normalize(correctAnswer) ? 1 : 0);
  }, 0);
}

function resolveAnswer(answer, options) {
  const value = answer.trim();
  const optionIndex = ["a", "b", "c", "d"].indexOf(normalize(value));
  return optionIndex >= 0 ? options[optionIndex] : value;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && insideQuotes && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function generateSerial(existingStudents, index) {
  const existing = new Set(existingStudents.map((student) => normalize(student.serial)));
  let serial = "";
  let counter = existingStudents.length + index + 1;

  do {
    serial = `QZ-${String(counter).padStart(4, "0")}`;
    counter += 1;
  } while (existing.has(normalize(serial)));

  return serial;
}

export default function App() {
  const [mode, setMode] = useState("student");
  const [students, setStudents] = useState(() => readStorage(STUDENTS_KEY, []));
  const [subjects, setSubjects] = useState(() => readStorage(SUBJECTS_KEY, seedSubjects));
  const [attempts, setAttempts] = useState(() => readStorage(ATTEMPTS_KEY, {}));
  const [loginName, setLoginName] = useState("");
  const [loginSerial, setLoginSerial] = useState("");
  const [student, setStudent] = useState(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjects[0]?.id);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(quizSettings.durationMinutes * 60);
  const [submitted, setSubmitted] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [securityWarnings, setSecurityWarnings] = useState(0);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [toast, setToast] = useState("");
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [settings, setSettings] = useState(() =>
    readStorage(SETTINGS_KEY, { durationMinutes: quizSettings.durationMinutes })
  );

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.id === selectedSubjectId),
    [subjects, selectedSubjectId]
  );

  const attemptKey = student && selectedSubject ? `${student.serial}:${selectedSubject.id}` : "";
  const previousAttempt = attemptKey ? attempts[attemptKey] : null;
  const isTakingQuiz = student && questions.length > 0 && !submitted;
  const durationSeconds = settings.durationMinutes * 60;

  useEffect(() => {
    let isMounted = true;

    loadQuizData({ students: STUDENTS_KEY, subjects: SUBJECTS_KEY, attempts: ATTEMPTS_KEY })
      .then((data) => {
        if (!isMounted) return;
        setStudents(data.students);
        setSubjects(data.subjects);
        setAttempts(data.attempts);
        setSelectedSubjectId(data.subjects[0]?.id);
      })
      .catch((error) => {
        console.error(error);
        if (isMounted) {
          setStorageError("Firebase permission denied. Update Firestore rules, then refresh.");
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingData(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => writeStorage(STUDENTS_KEY, students), [students]);
  useEffect(() => writeStorage(SUBJECTS_KEY, subjects), [subjects]);
  useEffect(() => writeStorage(ATTEMPTS_KEY, attempts), [attempts]);

  useEffect(() => {
    if (!selectedSubjectId && subjects[0]) setSelectedSubjectId(subjects[0].id);
  }, [subjects, selectedSubjectId]);

  useEffect(() => {
    if (!isTakingQuiz) return undefined;

    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          submitQuiz(true);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isTakingQuiz, answers, questions]);

  useEffect(() => {
    if (!isTakingQuiz) return undefined;

    function handleVisibilityChange() {
      if (!document.hidden) return;

      setSecurityWarnings((current) => {
        const next = current + 1;
        if (next >= 2) submitQuiz(true);
        return next;
      });
    }

    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isTakingQuiz, answers, questions]);

  function handleLogin(event) {
    event.preventDefault();
    const name = normalize(loginName);
    const serial = normalize(loginSerial);
    const matchedStudent = students.find(
      (entry) => normalize(entry.name) === name && normalize(entry.serial) === serial
    );

    if (!matchedStudent) {
      setLoginError("The name and serial number do not match a registered student.");
      return;
    }

    setStudent(matchedStudent);
    setLoginError("");
  }

  async function updateStudents(nextStudents) {
    setStudents(nextStudents);
    try {
      await saveStudents(nextStudents, STUDENTS_KEY);
      setStorageError("");
    } catch (error) {
      console.error(error);
      setStorageError("Could not save students to Firebase. Check Firestore rules.");
    }
  }

  async function updateSubjects(nextSubjects) {
    setSubjects(nextSubjects);
    try {
      await saveSubjects(nextSubjects, SUBJECTS_KEY);
      setStorageError("");
    } catch (error) {
      console.error(error);
      setStorageError("Could not save subjects to Firebase. Check Firestore rules.");
    }
  }

  function startQuiz() {
    if (!selectedSubject || previousAttempt) return;

    setQuestions(
      shuffle(selectedSubject.questions).map((question) => ({
        ...question,
        options: shuffle(question.options)
      }))
    );
    setAnswers({});
    setCurrentQuestion(0);
    setSecondsLeft(durationSeconds);
    setSecurityWarnings(0);
    setSubmitted(null);
  }

  function selectAnswer(questionIndex, answer) {
    setAnswers((current) => ({
      ...current,
      [questionIndex]: answer
    }));
  }

  async function submitQuiz(autoSubmitted = false) {
    if (!student || !selectedSubject || questions.length === 0) return;

    const score = scoreQuiz(questions, answers);
    const result = {
      studentName: student.name,
      serial: student.serial,
      subjectId: selectedSubject.id,
      subject: selectedSubject.title,
      score,
      total: questions.length,
      autoSubmitted,
      answers,
      submittedAt: new Date().toISOString()
    };

    const nextAttempts = { ...attempts, [attemptKey]: result };
    setAttempts(nextAttempts);
    setSubmitted(result);
    setIsSubmitConfirmOpen(false);
    setToast(autoSubmitted ? "Quiz auto-submitted." : "Quiz submitted successfully.");
    window.setTimeout(() => setToast(""), 3200);
    try {
      await saveAttempt(result, ATTEMPTS_KEY, attempts);
      setStorageError("");
    } catch (error) {
      console.error(error);
      setStorageError("Score shown locally, but Firebase rejected saving it. Check Firestore rules.");
    }
  }

  function resetSession() {
    setStudent(null);
    setQuestions([]);
    setAnswers({});
    setSubmitted(null);
    setLoginName("");
    setLoginSerial("");
    setLoginError("");
    setCurrentQuestion(0);
    setSecurityWarnings(0);
    setSecondsLeft(durationSeconds);
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setQuestions([]);
    setSubmitted(null);
  }

  async function clearAttempts() {
    setAttempts({});
    try {
      await clearStoredAttempts(ATTEMPTS_KEY);
      setStorageError("");
    } catch (error) {
      console.error(error);
      setStorageError("Could not clear Firebase attempts. Check Firestore rules.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <TopBar
        hideControls={Boolean(student) || isAdminLoggedIn}
        mode={mode}
        onModeChange={switchMode}
      />

      {mode === "student" && (
        <StudentPortal
          answers={answers}
          currentQuestion={currentQuestion}
          isTakingQuiz={isTakingQuiz}
          loginError={loginError}
          loginName={loginName}
          loginSerial={loginSerial}
          onCurrentQuestionChange={setCurrentQuestion}
          onLogin={handleLogin}
          onLoginNameChange={setLoginName}
          onLoginSerialChange={setLoginSerial}
          onResetSession={resetSession}
          onSelectAnswer={selectAnswer}
          onStartQuiz={startQuiz}
          onSubjectChange={(subjectId) => {
            setSelectedSubjectId(subjectId);
            setQuestions([]);
            setSubmitted(null);
            setCurrentQuestion(0);
          }}
          onSubmit={() => setIsSubmitConfirmOpen(true)}
          previousAttempt={previousAttempt}
          questions={questions}
          secondsLeft={secondsLeft}
          securityWarnings={securityWarnings}
          selectedSubject={selectedSubject}
          selectedSubjectId={selectedSubjectId}
          student={student}
          subjects={subjects}
          submitted={submitted}
          attempts={attempts}
        />
      )}

      {mode === "admin" && (
        <AdminPortal
          attempts={attempts}
          onAttemptsClear={clearAttempts}
          onLoginStateChange={setIsAdminLoggedIn}
          onSettingsChange={(nextSettings) => {
            setSettings(nextSettings);
            writeStorage(SETTINGS_KEY, nextSettings);
          }}
          onStudentsChange={updateStudents}
          onSubjectsChange={updateSubjects}
          settings={settings}
          students={students}
          subjects={subjects}
        />
      )}

      {isLoadingData && (
        <div className="fixed bottom-4 left-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-soft">
          Loading exam data...
        </div>
      )}

      {storageError && (
        <div className="fixed bottom-4 left-4 right-4 z-50 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 shadow-soft sm:left-auto sm:max-w-md">
          {storageError}
        </div>
      )}

      {toast && <Toast message={toast} />}

      {isSubmitConfirmOpen && (
        <ConfirmSubmitModal
          onCancel={() => setIsSubmitConfirmOpen(false)}
          onConfirm={() => submitQuiz(false)}
        />
      )}
    </main>
  );
}

function TopBar({ hideControls, mode, onModeChange }) {
  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-normal sm:text-2xl">{quizSettings.schoolName}</h1>
            <p className="text-sm text-slate-600">Timed objective test portal</p>
          </div>
        </div>

        {!hideControls && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onModeChange("student")}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold ${
                mode === "student" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              <GraduationCap size={17} />
              Student
            </button>
            <button
              onClick={() => onModeChange("admin")}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold ${
                mode === "admin" ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              <LayoutDashboard size={17} />
              Teacher Admin
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function ConfirmSubmitModal({ onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
      <div className="animate-pop w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <CheckCircle2 size={23} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-950">Submit quiz?</h2>
            <p className="text-sm text-slate-600">You cannot change your answers after submitting.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={onCancel}
            className="h-11 rounded-lg border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-50"
          >
            No, go back
          </button>
          <button
            onClick={onConfirm}
            className="h-11 rounded-lg bg-emerald-600 font-bold text-white hover:bg-emerald-700"
          >
            Yes, submit
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast({ message }) {
  return (
    <div className="animate-toast fixed right-4 top-4 z-[60] flex max-w-sm items-center gap-3 rounded-lg border border-emerald-200 bg-white px-4 py-3 font-bold text-emerald-700 shadow-soft">
      <CheckCircle2 size={20} />
      <span>{message}</span>
    </div>
  );
}

function StudentPortal(props) {
  const {
    attempts,
    isTakingQuiz,
    onSubjectChange,
    previousAttempt,
    selectedSubjectId,
    student,
    subjects,
    submitted
  } = props;

  return (
    <section className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[360px_1fr] lg:px-6">
      <aside className="space-y-4">
        <LoginCard {...props} />
        {student && !isTakingQuiz && (
          <SubjectSelector
            attempts={attempts}
            isTakingQuiz={isTakingQuiz}
            onSubjectChange={onSubjectChange}
            selectedSubjectId={selectedSubjectId}
            student={student}
            subjects={subjects}
          />
        )}
      </aside>

      <section className="rounded-lg border border-slate-200 bg-white shadow-soft">
        {!student && <WelcomePanel />}

        {student && !props.questions.length && !submitted && (
          <StartPanel
            selectedSubject={props.selectedSubject}
            previousAttempt={previousAttempt}
            onStart={props.onStartQuiz}
          />
        )}

        {student && isTakingQuiz && <QuizPanel {...props} />}

        {student && (submitted || previousAttempt) && !isTakingQuiz && (
          <ResultPanel result={submitted || previousAttempt} />
        )}
      </section>
    </section>
  );
}

function SubjectSelector({ attempts, isTakingQuiz, onSubjectChange, selectedSubjectId, student, subjects }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
        <BookOpen size={17} />
        Choose Exam
      </div>

      <div className="space-y-3">
        {subjects.map((subject) => {
          const subjectAttempt = attempts[`${student.serial}:${subject.id}`];
          const isSelected = selectedSubjectId === subject.id;

          return (
            <button
              key={subject.id}
              onClick={() => onSubjectChange(subject.id)}
              disabled={isTakingQuiz}
              className={`w-full rounded-lg border p-3 text-left transition ${
                isSelected ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"
              } ${isTakingQuiz ? "cursor-not-allowed opacity-70" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold">{subject.title}</span>
                {subjectAttempt && (
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                    Completed
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-600">{subject.questions.length} questions</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LoginCard({
  loginError,
  loginName,
  loginSerial,
  onLogin,
  onLoginNameChange,
  onLoginSerialChange,
  onResetSession,
  student
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
        <LockKeyhole size={17} />
        Secure Login
      </div>

      {!student ? (
        <form onSubmit={onLogin} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Student name</span>
            <input
              value={loginName}
              onChange={(event) => onLoginNameChange(event.target.value)}
              className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 outline-none transition focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
              placeholder="Example: Ada Okafor"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Serial number</span>
            <input
              value={loginSerial}
              onChange={(event) => onLoginSerialChange(event.target.value)}
              className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 outline-none transition focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
              placeholder="Example: QZ-001"
            />
          </label>
          {loginError && <p className="text-sm font-medium text-rose-600">{loginError}</p>}
          <button
            type="submit"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 font-bold text-white transition hover:bg-slate-800"
          >
            <LogIn size={18} />
            Login
          </button>
        </form>
      ) : (
        <div className="animate-card-in space-y-4">
          <div className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <UserRound size={20} />
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold">{student.name}</p>
              <p className="text-sm text-slate-600">{student.serial}</p>
            </div>
          </div>
          <button
            onClick={onResetSession}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-center font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <LogOut size={17} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

function WelcomePanel() {
  return (
    <div className="flex min-h-[560px] flex-col justify-center p-6 sm:p-10">
      <div className="max-w-2xl">
        <p className="mb-3 text-sm font-bold uppercase tracking-wide text-indigo-700">
          Objective Computer Based Test
        </p>
        <h2 className="text-3xl font-black tracking-normal text-slate-950 sm:text-4xl">
          Enter your registered name and serial number, choose your exam, and begin.
        </h2>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {[
            ["Randomized", "Question and option order are shuffled."],
            ["Timed", "The quiz submits when time runs out."],
            ["One Attempt", "Completed subjects lock for that student."]
          ].map(([title, text]) => (
            <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="font-bold">{title}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StartPanel({ selectedSubject, previousAttempt, onStart }) {
  return (
    <div className="flex min-h-[560px] flex-col justify-center p-6 sm:p-10">
      {previousAttempt ? (
        <div className="max-w-xl">
          <CheckCircle2 className="mb-4 text-emerald-600" size={42} />
          <h2 className="text-3xl font-black tracking-normal text-slate-950">
            This subject has already been submitted.
          </h2>
          <p className="mt-3 leading-7 text-slate-600">
            One-time login is active for this student and subject. The recorded score is shown here.
          </p>
        </div>
      ) : (
        <div className="max-w-xl">
          <p className="mb-3 text-sm font-bold uppercase tracking-wide text-indigo-700">
            Ready for {selectedSubject?.title}
          </p>
          <h2 className="text-3xl font-black tracking-normal text-slate-950">
            Start only when the student is ready.
          </h2>
          <p className="mt-3 leading-7 text-slate-600">
            The timer begins immediately. Each screen shows one question with randomized answer choices.
          </p>
          <button
            onClick={onStart}
            className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 font-bold text-white transition hover:bg-indigo-700"
          >
            <Clock3 size={18} />
            Start quiz
          </button>
        </div>
      )}
    </div>
  );
}

function QuizPanel({
  answers,
  currentQuestion,
  onCurrentQuestionChange,
  onSelectAnswer,
  onSubmit,
  questions,
  secondsLeft,
  securityWarnings
}) {
  const answeredCount = Object.keys(answers).length;
  const timeIsLow = secondsLeft <= 60;
  const question = questions[currentQuestion];
  const selectedAnswer = answers[currentQuestion];
  const isLastQuestion = currentQuestion === questions.length - 1;

  return (
    <div className="flex min-h-[620px] flex-col p-4 sm:p-6">
      <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Question {currentQuestion + 1} of {questions.length}</p>
            <p className="font-black text-slate-950">{answeredCount} answered</p>
          </div>
          <div
            className={`flex h-11 items-center justify-center gap-2 rounded-lg px-4 font-black ${
              timeIsLow ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-800"
            }`}
          >
            <Clock3 size={18} />
            {formatTime(secondsLeft)}
          </div>
        </div>
        {securityWarnings > 0 && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            Warning {securityWarnings}/2: leaving the quiz tab may auto-submit the exam.
          </div>
        )}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-indigo-600"
            style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <article className="flex flex-1 flex-col justify-center rounded-lg border border-slate-200 p-5 sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-black text-white">
            {currentQuestion + 1}
          </span>
          <h3 className="pt-1 text-xl font-black leading-8 text-slate-950 sm:text-2xl">{question.question}</h3>
        </div>

        <div className="grid gap-3">
          {question.options.map((option) => (
            <button
              key={option}
              onClick={() => onSelectAnswer(currentQuestion, option)}
              className={`choice-ring min-h-14 rounded-lg border px-4 py-3 text-left font-semibold transition ${
                selectedAnswer === option
                  ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                  : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </article>

      <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={() => onCurrentQuestionChange(Math.max(0, currentQuestion - 1))}
          disabled={currentQuestion === 0}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft size={18} />
          Previous
        </button>

        {isLastQuestion ? (
          <button
            onClick={onSubmit}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 font-bold text-white transition hover:bg-emerald-700"
          >
            <CheckCircle2 size={18} />
            Submit quiz
          </button>
        ) : (
          <button
            onClick={() => onCurrentQuestionChange(Math.min(questions.length - 1, currentQuestion + 1))}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 font-bold text-white transition hover:bg-indigo-700"
          >
            Next
            <ArrowRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

function ResultPanel({ result }) {
  const percentage = Math.round((result.score / result.total) * 100);

  return (
    <div className="flex min-h-[560px] flex-col justify-center p-6 sm:p-10">
      <div className="max-w-2xl">
        <p className="mb-3 text-sm font-bold uppercase tracking-wide text-emerald-700">
          {result.autoSubmitted ? "Auto-submitted" : "Submitted"}
        </p>
        <h2 className="text-3xl font-black tracking-normal text-slate-950 sm:text-4xl">
          Score: {result.score}/{result.total}
        </h2>
        <div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${percentage}%` }} />
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <ResultItem label="Student" value={result.studentName} />
          <ResultItem label="Serial" value={result.serial} />
          <ResultItem label="Subject" value={result.subject} />
          <ResultItem label="Percentage" value={`${percentage}%`} />
        </div>
      </div>
    </div>
  );
}

function AdminPortal({
  attempts,
  onAttemptsClear,
  onLoginStateChange,
  onSettingsChange,
  onStudentsChange,
  onSubjectsChange,
  settings,
  students,
  subjects
}) {
  const [adminName, setAdminName] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(() => Boolean(readStorage(ADMIN_SESSION_KEY, null)));
  const [adminError, setAdminError] = useState("");
  const [teacherName, setTeacherName] = useState(() => readStorage(ADMIN_SESSION_KEY, null)?.name || "");
  const [adminSection, setAdminSection] = useState("performance");

  useEffect(() => {
    onLoginStateChange(isUnlocked);
  }, [isUnlocked, onLoginStateChange]);

  if (!isUnlocked) {
    return (
      <section className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            <LockKeyhole size={17} />
            Teacher Access
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!adminName.trim()) {
                setAdminError("Enter the teacher name.");
                return;
              }

              if (adminCode === ADMIN_CODE) {
                const name = adminName.trim();
                setTeacherName(name);
                writeStorage(ADMIN_SESSION_KEY, { name });
                setIsUnlocked(true);
                setAdminError("");
              } else {
                setAdminError("Incorrect admin code.");
              }
            }}
            className="space-y-4"
          >
            <input
              value={adminName}
              onChange={(event) => setAdminName(event.target.value)}
              className="h-12 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
              placeholder="Teacher name"
            />
            <input
              value={adminCode}
              onChange={(event) => setAdminCode(event.target.value)}
              className="h-12 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
              placeholder="Teacher code"
              type="password"
            />
            {adminError && <p className="text-sm font-semibold text-rose-600">{adminError}</p>}
            <button className="h-12 w-full rounded-lg bg-indigo-600 font-bold text-white hover:bg-indigo-700">
              Open admin
            </button>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto grid max-w-6xl gap-4 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-6">
      <aside className="space-y-3 sm:space-y-4">
        <TeacherSessionCard
          teacherName={teacherName}
          onLogout={() => {
            setAdminName("");
            setAdminCode("");
            setTeacherName("");
            localStorage.removeItem(ADMIN_SESSION_KEY);
            setIsUnlocked(false);
            setAdminSection("performance");
          }}
        />
        <AdminNav active={adminSection} onChange={setAdminSection} />
      </aside>
      <div className="min-w-0 space-y-6">
        {adminSection === "performance" && (
          <PerformancePanel
            attempts={attempts}
            onAttemptsClear={onAttemptsClear}
            onSettingsChange={onSettingsChange}
            settings={settings}
            students={students}
            subjects={subjects}
          />
        )}
        {adminSection === "students" && <UploadStudentsCard onStudentsChange={onStudentsChange} students={students} />}
        {adminSection === "subjects" && <SubjectManager subjects={subjects} onSubjectsChange={onSubjectsChange} />}
        {adminSection === "questions" && (
          <>
            <UploadQuestionsCard onSubjectsChange={onSubjectsChange} subjects={subjects} />
            <QuestionBank subjects={subjects} />
          </>
        )}
      </div>
    </section>
  );
}

function AdminNav({ active, onChange }) {
  const items = [
    ["performance", BarChart3, "Performance"],
    ["students", UserPlus, "Students"],
    ["subjects", BookOpen, "Subjects"],
    ["questions", FileUp, "Questions"]
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-soft">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        {items.map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 py-2 text-center text-sm font-bold lg:justify-start lg:px-3 lg:text-left ${
              active === id ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TeacherSessionCard({ onLogout, teacherName }) {
  return (
    <div className="animate-card-in rounded-lg border border-slate-200 bg-white p-3 shadow-soft sm:p-5">
      <div className="flex items-center gap-3 rounded-lg bg-indigo-50 p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <UserRound size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{teacherName}</p>
          <p className="text-sm text-slate-600">Teacher admin</p>
        </div>
      </div>
      <button
        onClick={onLogout}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-sm font-bold text-slate-700 hover:bg-slate-50 sm:mt-4 sm:text-base"
      >
        <LogOut size={17} />
        Log out
      </button>
    </div>
  );
}

function SubjectManager({ onSubjectsChange, subjects }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    const cleanTitle = title.trim();

    if (!cleanTitle) {
      setMessage("Enter a subject name.");
      return;
    }

    const id = slugify(cleanTitle);
    const exists = subjects.some((subject) => subject.id === id);

    if (exists) {
      setMessage("That subject already exists.");
      return;
    }

    await onSubjectsChange([...subjects, { id, title: cleanTitle, questions: [] }]);
    setTitle("");
    setMessage("Subject added. You can now upload questions for it.");
  }

  async function removeSubject(subjectId) {
    await onSubjectsChange(subjects.filter((subject) => subject.id !== subjectId));
    setMessage("Subject removed.");
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
        <BookOpen size={17} />
        Subjects
      </div>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="h-11 rounded-lg border border-slate-300 px-3 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
          placeholder="Example: Basic Science"
        />
        <button className="inline-flex h-11 items-center justify-center rounded-lg bg-indigo-600 px-4 font-bold text-white hover:bg-indigo-700">
          Add subject
        </button>
      </form>
      {message && <p className="mt-3 text-sm font-semibold text-slate-600">{message}</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {subjects.map((subject) => (
          <div key={subject.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-black">{subject.title}</p>
                <p className="mt-1 text-sm text-slate-600">{subject.questions.length} questions</p>
              </div>
              <button
                onClick={() => removeSubject(subject.id)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-sm font-bold text-rose-700 hover:bg-rose-50"
              >
                <Trash2 size={16} />
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UploadQuestionsCard({ onSubjectsChange, subjects }) {
  const [message, setMessage] = useState("");

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const rows = parseCsv(text);
    const [header, ...body] = rows;
    const headers = header.map(normalize);
    const subjectIndex = headers.indexOf("subject");
    const questionIndex = headers.indexOf("question");
    const optionAIndex = headers.indexOf("optiona");
    const optionBIndex = headers.indexOf("optionb");
    const optionCIndex = headers.indexOf("optionc");
    const optionDIndex = headers.indexOf("optiond");
    const answerIndex = headers.indexOf("answer");

    if ([subjectIndex, questionIndex, optionAIndex, optionBIndex, optionCIndex, optionDIndex, answerIndex].includes(-1)) {
      setMessage("CSV needs: subject, question, optionA, optionB, optionC, optionD, answer.");
      return;
    }

    const grouped = new Map();
    body.forEach((row) => {
      const subjectTitle = row[subjectIndex];
      const options = [row[optionAIndex], row[optionBIndex], row[optionCIndex], row[optionDIndex]].filter(Boolean);
      const question = row[questionIndex];
      const answer = resolveAnswer(row[answerIndex] || "", options);

      if (!subjectTitle || !question || !answer || options.length < 2) return;

      const id = slugify(subjectTitle);
      if (!grouped.has(id)) grouped.set(id, { id, title: subjectTitle, questions: [] });
      grouped.get(id).questions.push({ question, options, answer });
    });

    const uploadedSubjects = Array.from(grouped.values());
    const existingById = new Map(subjects.map((subject) => [subject.id, subject]));
    uploadedSubjects.forEach((subject) => existingById.set(subject.id, subject));
    await onSubjectsChange(Array.from(existingById.values()));
    setMessage(`${uploadedSubjects.length} subject question bank uploaded.`);
    event.target.value = "";
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
        <FileUp size={17} />
        Upload Questions
      </div>
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center hover:bg-indigo-50">
        <FileUp size={24} className="mb-2 text-indigo-600" />
        <span className="font-bold">Upload CSV</span>
        <span className="mt-1 text-sm text-slate-600">subject, question, optionA, optionB, optionC, optionD, answer</span>
        <input className="hidden" type="file" accept=".csv" onChange={handleFile} />
      </label>
      <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
        <p className="font-bold text-slate-800">Format example:</p>
        <p>subject = Mathematics or English Language</p>
        <p>answer can be the exact option text, or A/B/C/D.</p>
      </div>
      {message && <p className="mt-3 text-sm font-semibold text-slate-600">{message}</p>}
    </div>
  );
}

function UploadStudentsCard({ onStudentsChange, students }) {
  const [message, setMessage] = useState("");
  const [latestUpload, setLatestUpload] = useState([]);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const rows = parseCsv(await file.text());
    const [header, ...body] = rows;
    const headers = header.map(normalize);
    const nameIndex = headers.indexOf("name");
    const serialIndex = headers.indexOf("serial");

    if (nameIndex === -1) {
      setMessage("CSV needs at least a name column.");
      return;
    }

    const existingBySerial = new Map(students.map((entry) => [normalize(entry.serial), entry]));
    const uploadedStudents = body
      .map((row, index) => {
        const givenSerial = serialIndex >= 0 ? row[serialIndex] : "";
        const serial = givenSerial || generateSerial([...existingBySerial.values()], index);
        return { name: row[nameIndex], serial };
      })
      .filter((entry) => entry.name && entry.serial);

    uploadedStudents.forEach((entry) => existingBySerial.set(normalize(entry.serial), entry));
    await onStudentsChange(Array.from(existingBySerial.values()));
    setLatestUpload(uploadedStudents);
    setMessage(`${uploadedStudents.length} students imported. Serial numbers have been generated.`);
    event.target.value = "";
  }

  function downloadSerials() {
    downloadCsv("generated-student-serials.csv", [
      ["name", "serial"],
      ...latestUpload.map((student) => [student.name, student.serial])
    ]);
  }

  async function removeStudent(serial) {
    await onStudentsChange(students.filter((student) => student.serial !== serial));
    setMessage("Student removed.");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          <UserPlus size={17} />
          Upload Students
        </div>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 font-bold text-slate-700 hover:bg-slate-50">
          <FileUp size={17} />
          Upload student CSV
          <input className="hidden" type="file" accept=".csv" onChange={handleFile} />
        </label>
        <p className="mt-3 text-sm text-slate-600">CSV format: name. Serial is generated automatically.</p>
        {message && <p className="mt-2 text-sm font-semibold text-slate-600">{message}</p>}
        {latestUpload.length > 0 && (
          <button
            onClick={downloadSerials}
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
          >
            <Download size={16} />
            Download serial list
          </button>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            <UserRound size={17} />
            Registered Students
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            {students.length}
          </span>
        </div>
        <div className="grid gap-3">
          {students.map((student) => (
            <div key={student.serial} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-black">{student.name}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{student.serial}</p>
                </div>
                <button
                  onClick={() => removeStudent(student.serial)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-sm font-bold text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 size={16} />
                  Remove
                </button>
              </div>
            </div>
          ))}
          {!students.length && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
              No students uploaded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PerformancePanel({ attempts, onAttemptsClear, onSettingsChange, settings, students, subjects }) {
  const results = Object.values(attempts);
  const average = results.length
    ? Math.round(results.reduce((total, attempt) => total + (attempt.score / attempt.total) * 100, 0) / results.length)
    : 0;

  function exportPerformance() {
    downloadCsv("student-performance.csv", [
      ["studentName", "serial", "subject", "score", "total", "percentage", "submittedAt"],
      ...results.map((attempt) => [
        attempt.studentName,
        attempt.serial,
        attempt.subject,
        attempt.score,
        attempt.total,
        Math.round((attempt.score / attempt.total) * 100),
        attempt.submittedAt
      ])
    ]);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-soft sm:p-5">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          <BarChart3 size={17} />
          Student Performance
        </div>
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <button
            onClick={exportPerformance}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <Download size={16} />
            Export CSV
          </button>
          <button
            onClick={onAttemptsClear}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-700"
          >
            Clear results
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Metric label="Registered" value={students.length} />
        <Metric label="Subjects" value={subjects.length} />
        <Metric label="Average" value={`${average}%`} />
      </div>

      <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Quiz Time</p>
            <p className="mt-1 text-sm text-slate-600">Set the duration students get for each quiz.</p>
          </div>
          <label className="flex items-center gap-2">
            <input
              min="1"
              max="180"
              type="number"
              value={settings.durationMinutes}
              onChange={(event) => {
                const durationMinutes = Math.max(1, Number(event.target.value) || 1);
                onSettingsChange({ ...settings, durationMinutes });
              }}
              className="h-11 w-24 rounded-lg border border-slate-300 px-3 text-center font-black outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
            />
            <span className="text-sm font-bold text-slate-700">minutes</span>
          </label>
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {results.map((attempt) => (
          <div key={`${attempt.serial}-${attempt.subjectId}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-black">{attempt.studentName}</p>
                <p className="mt-1 text-sm font-semibold text-slate-600">{attempt.serial}</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-black text-emerald-700">
                {Math.round((attempt.score / attempt.total) * 100)}%
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <ResultMini label="Subject" value={attempt.subject} />
              <ResultMini label="Score" value={`${attempt.score}/${attempt.total}`} />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500">
              {new Date(attempt.submittedAt).toLocaleString()}
            </p>
          </div>
        ))}
        {!results.length && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
            No student submissions yet.
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-3 pr-3 font-bold">Student</th>
              <th className="py-3 pr-3 font-bold">Serial</th>
              <th className="py-3 pr-3 font-bold">Subject</th>
              <th className="py-3 pr-3 font-bold">Score</th>
              <th className="py-3 pr-3 font-bold">Percent</th>
              <th className="py-3 pr-3 font-bold">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {results.map((attempt) => (
              <tr key={`${attempt.serial}-${attempt.subjectId}`} className="border-b border-slate-100">
                <td className="py-3 pr-3 font-bold">{attempt.studentName}</td>
                <td className="py-3 pr-3">{attempt.serial}</td>
                <td className="py-3 pr-3">{attempt.subject}</td>
                <td className="py-3 pr-3">{attempt.score}/{attempt.total}</td>
                <td className="py-3 pr-3">{Math.round((attempt.score / attempt.total) * 100)}%</td>
                <td className="py-3 pr-3">{new Date(attempt.submittedAt).toLocaleString()}</td>
              </tr>
            ))}
            {!results.length && (
              <tr>
                <td className="py-8 text-center font-semibold text-slate-500" colSpan="6">
                  No student submissions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultMini({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-black text-slate-900">{value}</p>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function QuestionBank({ subjects }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
        <BookOpen size={17} />
        Question Bank
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {subjects.map((subject) => (
          <div key={subject.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="font-black">{subject.title}</p>
            <p className="mt-1 text-sm text-slate-600">{subject.questions.length} uploaded questions</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultItem({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

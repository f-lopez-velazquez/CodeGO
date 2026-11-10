/* Curriculum logic shared by browser UI and regression tests. */
(function(root) {
  'use strict';
  const content = typeof module !== 'undefined' && module.exports ? require('./course-content') : root.CodeGOCourseContent;
  function validateAssignment(value) {
    if (!value || value.format !== 'codego-activity-v1' || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120) throw new Error('La actividad necesita un título de hasta 120 caracteres.');
    if (!['task', 'exam'].includes(value.mode)) throw new Error('Elige tarea o examen.');
    if (typeof value.prompt !== 'string' || value.prompt.length > 20000 || typeof value.starter !== 'string' || value.starter.length > 100000) throw new Error('El enunciado o código inicial no es válido.');
    if (!Array.isArray(value.tests) || !value.tests.length || value.tests.length > 30 || value.tests.some(test => !test || typeof test.check !== 'string' || !test.check.trim() || test.check.length > 10000 || typeof test.feedback !== 'string' || test.feedback.length > 1000)) throw new Error('Agrega de 1 a 30 pruebas con check y feedback de texto.');
    return { format: value.format, title: value.title.trim(), prompt: value.prompt, starter: value.starter, mode: value.mode, tests: value.tests.map(({ check, feedback }) => ({ check, feedback })) };
  }

  function scoreQuiz(questions, answers) {
    const results = questions.map((question, index) => ({ correct: Number.isInteger(answers[index]) && answers[index] === question.answer, answered: Number.isInteger(answers[index]), explanation: question.explanation }));
    const correct = results.filter(result => result.correct).length;
    return { correct, total: questions.length, percent: questions.length ? Math.round(correct / questions.length * 100) : 0, results };
  }
  function lessonProgress(lesson, learning = {}) {
    const quiz = lesson.quiz.filter((question,index) => learning.quiz?.[`${lesson.id}:${index}`]?.correct).length;
    const exercises = lesson.exercises.filter(exercise => learning.exercises?.[exercise.id]?.passed).length;
    return { quiz, exercises, mastered: quiz === lesson.quiz.length && exercises === lesson.exercises.length };
  }
  function assessmentQuestions(assessment) {
    return assessment.questionIds.map(key => { const [id,index] = key.split(':'); const lesson = content.lessons.find(item => item.id === id); return { ...lesson.quiz[Number(index)], key, lessonTitle: lesson.title }; });
  }
  const course = { ...content, validateAssignment, scoreQuiz, lessonProgress, assessmentQuestions };
  if (typeof module !== 'undefined' && module.exports) module.exports = course; else root.CodeGOCourse = course;
})(globalThis);

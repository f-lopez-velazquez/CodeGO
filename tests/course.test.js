const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { lessons, validateAssignment } = require('../webapp/course');

test('Every express lesson accepts a correct Python solution and rejects the starter', () => {
  const solutions = require('./fixtures/course-solutions.json');
  const exercises = lessons.flatMap(lesson => lesson.exercises).concat(require('../webapp/course').assessments.map(assessment => assessment.exercise));
  const fixtures = exercises.map(exercise => ({ ...exercise, solution: solutions[exercise.id] }));
  assert.equal(fixtures.length, 44);
  assert(fixtures.every(fixture => typeof fixture.solution === 'string'), 'Each exercise needs an independently checked reference solution');
  const python = process.env.CODEGO_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const result = spawnSync(python, ['-c', `import json, sys\nfor lesson in json.load(sys.stdin):\n    scope = {}\n    exec(lesson['solution'], scope)\n    for test in lesson['tests']: exec(test['check'], scope)\n    scope = {}\n    exec(lesson['starter'], scope)\n    failures = 0\n    for test in lesson['tests']:\n        try: exec(test['check'], scope)\n        except Exception: failures += 1\n    assert failures > 0, lesson['id']\n`], { input: JSON.stringify(fixtures), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  for (const lesson of lessons) assert.match(lesson.source, /^https:\/\/github.com\/freeCodeCamp\/freeCodeCamp\//);
});

test('Teacher assignments require bounded, explicit Python checks and feedback', () => {
  const valid = { format: 'codego-activity-v1', title: 'Suma', mode: 'task', prompt: 'Suma dos números', starter: 'def sumar(a,b): pass', tests: [{ check: 'assert sumar(1,2)==3', feedback: 'Usa return a+b' }] };
  assert.deepEqual(validateAssignment(valid), valid);
  for (const value of [null, {}, { ...valid, mode: 'unknown' }, { ...valid, tests: [] }, { ...valid, tests: [{ check: '', feedback: 'a' }] }, { ...valid, tests: Array(31).fill(valid.tests[0]) }]) assert.throws(() => validateAssignment(value));
});


test('All teaching examples produce the documented stdout in real Python', () => {
  const examples = lessons.flatMap(lesson => lesson.examples);
  assert.equal(examples.length, 40);
  const python = process.env.CODEGO_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const code = `import contextlib, io, json, os, sys, tempfile
examples = json.load(sys.stdin)
with tempfile.TemporaryDirectory() as directory:
    os.chdir(directory)
    for example in examples:
        output = io.StringIO()
        with contextlib.redirect_stdout(output): exec(example['code'], {})
        assert output.getvalue().strip() == example['output'].strip(), (example['title'], output.getvalue(), example['output'])
`;
  const result = spawnSync(python, ['-c', code], { input: JSON.stringify(examples), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('Quiz scoring distinguishes unanswered, wrong and correct answers; mastery requires code too', () => {
  const { scoreQuiz, lessonProgress, assessmentQuestions, assessments } = require('../webapp/course');
  const lesson = lessons[0];
  assert.equal(scoreQuiz(lesson.quiz, []).correct, 0);
  assert.equal(scoreQuiz(lesson.quiz, lesson.quiz.map(question => question.answer)).percent, 100);
  assert.equal(scoreQuiz(lesson.quiz, lesson.quiz.map(question => (question.answer + 1) % question.choices.length)).percent, 0);
  const learning = { quiz: {}, exercises: {} };
  lesson.quiz.forEach((_,index) => { learning.quiz[`${lesson.id}:${index}`] = { correct: true }; });
  assert.equal(lessonProgress(lesson, learning).mastered, false);
  lesson.exercises.forEach(exercise => { learning.exercises[exercise.id] = { passed: true }; });
  assert.equal(lessonProgress(lesson, learning).mastered, true);
  for (const assessment of assessments) assert.equal(assessmentQuestions(assessment).length, 12);
  assert.equal(lessons.reduce((count,lesson) => count + lesson.quiz.length, 0), 60);
});

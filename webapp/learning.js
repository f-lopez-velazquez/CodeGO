/* Small DOM controller for lessons and local assessments. All persisted content is rendered as text. */
(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const curriculum = root.CodeGOCourse;
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  root.createCodeGOLearning = function ({ getState, changed, startExercise, toast, download }) {
    let activeLesson = curriculum.lessons[0];
    let activeAssessment = curriculum.assessments[0];
    let area = 'lessons';
    let step = 'understand';
    let examplePlayers = [];
    let reviewing = false;
    function clearExamples() { examplePlayers.forEach(player => player.destroy()); examplePlayers = []; }
    function learning() {
      const state = getState();
      state.learning ||= { version: 2, quiz: {}, exercises: {}, assessments: {} };
      state.learning.quiz ||= {}; state.learning.exercises ||= {}; state.learning.assessments ||= {};
      return state.learning;
    }
    function renderProgress() {
      const count = curriculum.lessons.filter(lesson => curriculum.lessonProgress(lesson, learning()).mastered).length;
      $('course-progress').value = count;
      $('course-progress-label').textContent = `${count} de ${curriculum.lessons.length} lecciones dominadas`;
      const profile = curriculum.journey(learning());
      $('journey-level').textContent = `Nivel ${profile.level}`;
      $('journey-xp').textContent = `${profile.xp} XP`;
      $('journey-meter').value = profile.levelXP;
      $('journey-next').textContent = `${200 - profile.levelXP} XP para subir · sin perder lo que ya ganaste`;
      $('learning-review').textContent = `Repasar${profile.missions.some(m => m.needsReview) ? ' · pendiente' : ''}`;
    }
    function renderNavigation() {
      const list = $('lesson-list'); list.replaceChildren();
      const picker = $('mobile-lesson-select'); picker.replaceChildren();
      const profile = curriculum.journey(learning());
      const choices = area === 'lessons' ? curriculum.lessons : curriculum.assessments;
      choices.forEach((item,index) => { const option = node('option', `${index + 1}. ${item.title}`); option.value = item.id; option.disabled = area === 'lessons' && !profile.missions[index].unlocked; picker.append(option); });
      picker.value = area === 'lessons' ? activeLesson.id : activeAssessment.id;
      picker.onchange = () => { reviewing = false; if (area === 'lessons') { activeLesson = curriculum.lessons.find(item => item.id === picker.value); step = 'understand'; } else activeAssessment = curriculum.assessments.find(item => item.id === picker.value); render(); };
      if (area === 'lessons') {
        curriculum.modules.forEach((moduleTitle, moduleIndex) => {
          list.append(node('p', `Mundo ${moduleIndex + 1} · ${moduleTitle}`, 'module-title'));
          curriculum.lessons.filter(lesson => lesson.module === moduleIndex).forEach(lesson => {
            const progress = curriculum.lessonProgress(lesson, learning());
            const index = curriculum.lessons.indexOf(lesson) + 1;
            const button = node('button', `${progress.mastered ? '✓' : String(index).padStart(2, '0')} · ${lesson.title}`);
            button.setAttribute('aria-current', String(lesson.id === activeLesson.id));
            button.dataset.lessonId = lesson.id;
            const mission = profile.missions[index - 1];
            button.disabled = !mission.unlocked;
            button.classList.toggle('mission-complete', progress.mastered);
            button.title = !mission.unlocked ? 'Completa las misiones anteriores para desbloquearla.' : progress.mastered ? 'Misión completada. Puedes volver a practicar.' : 'Tu siguiente misión';
            button.onclick = () => { activeLesson = lesson; step = 'understand'; reviewing = false; render(); $('lesson-content').scrollIntoView({ block: 'start' }); };
            list.append(button);
          });
        });
      } else {
        curriculum.assessments.forEach(assessment => {
          const button = node('button', assessment.title);
          button.dataset.assessmentId = assessment.id;
          button.setAttribute('aria-current', String(activeAssessment.id === assessment.id));
          button.onclick = () => { activeAssessment = assessment; render(); };
          list.append(button);
        });
      }
    }
    function heading(title, eyebrow, description) {
      const header = node('header', undefined, 'lesson-heading');
      header.append(node('small', eyebrow), node('h3', title), node('p', description));
      return header;
    }
    function exerciseCard(exercise, lesson, assessment = null) {
      const card = node('section', undefined, 'exercise-card');
      const result = learning().exercises[exercise.id];
      card.append(node('h5', exercise.title), node('p', exercise.prompt));
      card.append(node('p', `${exercise.tests.length} comprobaciones · ${result?.passed ? 'Superado' : 'Pendiente'}${result?.attempts ? ` · ${result.attempts} intentos` : ''}`, 'exercise-meta'));
      const checks = node('details'); checks.append(node('summary', 'Qué se comprobará'));
      const list = node('ul'); exercise.tests.forEach(test => list.append(node('li', test.feedback))); checks.append(list); card.append(checks);
      exercise.hints.forEach((hint, index) => {
        const details = node('details'); details.append(node('summary', `Pista ${index + 1}`), node('p', hint)); card.append(details);
      });
      const button = node('button', 'Practicar este ejercicio', 'primary');
      button.dataset.exerciseId = exercise.id;
      button.onclick = () => startExercise(exercise, lesson?.id || null, assessment?.id || null);
      card.append(button);
      return card;
    }
    function renderLesson() {
      clearExamples();
      const lesson = activeLesson;
      const progress = curriculum.lessonProgress(lesson, learning());
      const container = $('lesson-content'); container.replaceChildren();
      container.append(heading(lesson.title, `MISIÓN ${curriculum.lessons.indexOf(lesson) + 1} / 20 · ${lesson.minutes} MIN`, progress.mastered ? '¡Misión completa! Vuelve cuando quieras para afianzarla.' : 'Mira cómo funciona. Ponlo a prueba. Hazlo tú.'));
      const milestones = node('div', undefined, 'mission-goals');
      milestones.append(node('span', `${progress.quiz === lesson.quiz.length ? '✓' : '○'} Entender · ${progress.quiz}/${lesson.quiz.length}`), node('span', `${progress.exercises === lesson.exercises.length ? '✓' : '○'} Hacer · ${progress.exercises}/${lesson.exercises.length}`), node('span', '+140 XP por misión'));
      container.append(milestones);
      const tabs = node('nav', undefined, 'lesson-tabs'); tabs.setAttribute('aria-label', 'Pasos de la lección');
      const steps = [['understand', 'Entender'], ['examples', 'Ejemplos'], ['quiz', 'Comprobar'], ['practice', 'Practicar']];
      steps.forEach(([id, text]) => {
        const button = node('button', text); button.dataset.lessonStep = id;
        button.setAttribute('aria-pressed', String(step === id));
        button.onclick = () => { step = id; renderLesson(); };
        tabs.append(button);
      });
      container.append(tabs);
      const section = node('section', undefined, 'lesson-section');
      if (step === 'understand') {
        section.append(node('p', lesson.explanation[0], 'lesson-hook'));
        const deeper = node('details'); deeper.append(node('summary', 'Cuéntame un poco más'));
        lesson.explanation.slice(1).forEach(text => deeper.append(node('p', text))); section.append(deeper);
        section.append(node('h4', 'Quédate con estas ideas'));
        const points = node('ul', undefined, 'lesson-keypoints'); lesson.keyPoints.forEach(text => points.append(node('li', text))); section.append(points);
        section.append(node('p', lesson.pitfall, 'pitfall'));
      } else if (step === 'examples') {
        section.append(node('p', 'Observa cómo se escribe el programa y sigue sus valores. Puedes pausar o elegir cada paso.', 'demo-instructions'));
        lesson.examples.forEach((example, index) => {
          const key = `${lesson.id}:${index}`;
          let player;
          player = root.createCodeGOExamplePlayer({ example, trace: root.CodeGOExampleTraces.examples[key], key, autoplay: index === 0,
            onStart: () => examplePlayers.forEach(other => { if (other !== player) other.pause(); }) });
          examplePlayers.push(player); section.append(player.element);
        });
      } else if (step === 'quiz') {
        section.append(node('h4', 'A ver qué tal: prueba sin miedo'));
        lesson.quiz.forEach((question, index) => {
          const key = `${lesson.id}:${index}`;
          const previous = learning().quiz[key];
          const fieldset = node('fieldset', undefined, 'quiz-question'); fieldset.append(node('legend', `${index + 1}. ${question.prompt}`));
          let selected = previous?.choice ?? null;
          question.choices.forEach((choice, choiceIndex) => {
            const label = node('label'); const input = node('input'); input.type = 'radio'; input.name = `quiz-${key}`; input.value = choiceIndex; input.checked = selected === choiceIndex;
            input.onchange = () => { selected = choiceIndex; };
            label.append(input, node('span', choice)); fieldset.append(label);
          });
          const feedback = node('p', undefined, 'quiz-feedback'); feedback.setAttribute('role', 'status'); feedback.hidden = !previous;
          function showResult(result) { feedback.hidden = false; feedback.className = `quiz-feedback ${result.correct ? 'correct' : 'incorrect'}`; feedback.textContent = `${result.correct ? '¡Eso es! +10 XP la primera vez.' : 'Casi. Prueba otra vez:'} ${question.explanation}`; }
          if (previous) showResult(previous);
          const button = node('button', 'Comprobar respuesta');
          button.onclick = () => {
            if (selected === null) return toast('Selecciona una respuesta antes de comprobarla.');
            const previousResult = learning().quiz[key];
            const result = { bestCorrect: previousResult?.correct || previousResult?.bestCorrect || selected === question.answer, choice: selected, correct: selected === question.answer, attempts: (learning().quiz[key]?.attempts || 0) + 1, at: new Date().toISOString() };
            learning().quiz[key] = result; changed(); showResult(result); renderProgress(); renderNavigation();
          };
          fieldset.append(button, feedback); section.append(fieldset);
        });
      } else {
        section.append(node('h4', 'Lleva la idea al código'));
        lesson.exercises.forEach(exercise => section.append(exerciseCard(exercise, lesson)));
      }
      container.append(section);
      const actions = node('div', undefined, 'lesson-actions');
      const index = steps.findIndex(([id]) => id === step);
      if (index < steps.length - 1) {
        const next = node('button', `Continuar: ${steps[index + 1][1]}`, 'primary'); next.onclick = () => { step = steps[index + 1][0]; renderLesson(); }; actions.append(next);
      } else {
        const nextLesson = curriculum.lessons[curriculum.lessons.indexOf(lesson) + 1];
        if (nextLesson) { const next = node('button', progress.mastered ? '¡Siguiente misión! →' : 'Completa las pruebas para abrir la siguiente'); next.disabled = !progress.mastered; next.onclick = () => { activeLesson = nextLesson; step = 'understand'; render(); }; actions.append(next); }
      }
      const link = node('a', 'Tema de referencia en freeCodeCamp ↗'); link.href = lesson.source; link.target = '_blank'; link.rel = 'noopener'; actions.append(link); container.append(actions);
    }
    function renderAssessment() {
      clearExamples();
      const assessment = activeAssessment;
      const questions = curriculum.assessmentQuestions(assessment);
      const saved = learning().assessments[assessment.id];
      const container = $('lesson-content'); container.replaceChildren();
      container.append(heading(assessment.title, 'EVALUACIÓN DE PRÁCTICA', `${questions.length} preguntas y ${assessment.exercise.tests.length} pruebas de código. Los resultados son locales y orientativos.`));
      const form = node('form');
      const answers = questions.map((_, index) => saved?.answers?.[index] ?? null);
      questions.forEach((question, index) => {
        const fieldset = node('fieldset', undefined, 'quiz-question'); fieldset.append(node('legend', `${index + 1}. ${question.prompt}`));
        question.choices.forEach((choice, choiceIndex) => {
          const label = node('label'); const input = node('input'); input.type = 'radio'; input.name = `assessment-${index}`; input.value = choiceIndex; input.checked = answers[index] === choiceIndex; input.disabled = Boolean(saved);
          input.onchange = () => { answers[index] = choiceIndex; }; label.append(input, node('span', choice)); fieldset.append(label);
        });
        if (saved) { const correct = saved.answers[index] === question.answer; fieldset.append(node('p', `${correct ? 'Correcto.' : 'Para repasar.'} ${question.explanation}`, `quiz-feedback ${correct ? 'correct' : 'incorrect'}`)); }
        form.append(fieldset);
      });
      if (!saved) {
        const submit = node('button', 'Calificar mis respuestas', 'primary'); submit.type = 'submit'; form.append(submit);
        form.onsubmit = event => {
          event.preventDefault();
          if (answers.some(answer => answer === null)) return toast('Responde todas las preguntas antes de calificar.');
          const grade = curriculum.scoreQuiz(questions, answers);
          learning().assessments[assessment.id] = { answers, correct: grade.correct, total: grade.total, percent: grade.percent, at: new Date().toISOString() };
          changed(); renderAssessment();
        };
      } else {
        const summary = node('section'); summary.id = 'assessment-result'; summary.setAttribute('role', 'status');
        summary.append(node('strong', `${saved.correct}/${saved.total} respuestas correctas · ${saved.percent}%`), node('p', saved.percent >= 80 ? 'La comprensión está encaminada. Completa también el reto de código.' : 'Repasa las explicaciones de las respuestas y vuelve a intentarlo.'));
        const retry = node('button', 'Volver a evaluar'); retry.type = 'button'; retry.onclick = () => { delete learning().assessments[assessment.id]; changed(); renderAssessment(); }; summary.append(retry); container.append(summary);
      }
      container.append(form, node('h4', 'Reto práctico de la unidad'), exerciseCard(assessment.exercise, null, assessment));
      const exportButton = node('button', 'Descargar reto de código para el docente'); exportButton.onclick = () => {
        const activity = curriculum.validateAssignment({ format: 'codego-activity-v1', title: assessment.title, mode: 'task', prompt: assessment.exercise.prompt, starter: assessment.exercise.starter, tests: assessment.exercise.tests });
        download(`${assessment.id}.codego-actividad.json`, JSON.stringify(activity, null, 2));
      }; container.append(exportButton);
    }
    function renderReview() {
      clearExamples();
      const container = $('lesson-content'); container.replaceChildren(heading('Una vuelta rápida', 'ZONA DE REPASO', 'Vuelve a las ideas que se te complicaron. Tu XP se conserva.'));
      const missions = curriculum.journey(learning()).missions;
      const available = missions.filter(m => m.unlocked && (m.quiz || m.exercises));
      if (!available.length) container.append(node('p', 'Completa tu primera prueba y aquí tendrás tus repasos.'));
      available.sort((a,b) => Number(b.needsReview) - Number(a.needsReview)).forEach(mission => {
        const lesson = curriculum.lessons.find(item => item.id === mission.id);
        const card = node('section', undefined, 'review-mission');
        card.append(node('strong', lesson.title), node('p', mission.needsReview ? 'Vamos a reforzar esta idea.' : 'Lo llevas bien. ¿Te sale otra vez?'));
        const button = node('button', 'Repasar esta misión'); button.onclick = () => { activeLesson = lesson; area = 'lessons'; reviewing = false; step = 'quiz'; render(); }; card.append(button); container.append(card);
      });
    }
    $('learning-review').onclick = () => { area = 'lessons'; reviewing = true; render(); };
    function render() {
      if (!getState()) return;
      renderProgress(); renderNavigation();
      $('learning-lessons').setAttribute('aria-pressed', String(area === 'lessons' && !reviewing));
      $('learning-assessments').setAttribute('aria-pressed', String(area === 'assessments'));
      if (reviewing) renderReview(); else if (area === 'lessons') renderLesson(); else renderAssessment();
      $('learning-review').setAttribute('aria-pressed', String(reviewing));
    }
    $('learning-lessons').onclick = () => { reviewing = false; area = 'lessons'; render(); };
    $('learning-assessments').onclick = () => { reviewing = false; area = 'assessments'; render(); };
    $('learning-report').onclick = () => {
      const state = getState();
      const report = { format: 'codego-learning-report-v2', student: state.student, generatedAt: new Date().toISOString(), learning: learning(), masteredLessons: curriculum.lessons.filter(lesson => curriculum.lessonProgress(lesson, learning()).mastered).map(lesson => lesson.id), note: 'Progreso local de práctica. No acredita autoría ni calificación institucional.' };
      download('codego-progreso.json', JSON.stringify(report, null, 2));
    };
    return { render, pauseAnimations: () => examplePlayers.forEach(player => player.pause()) };
  };
})(globalThis);

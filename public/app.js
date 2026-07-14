const $ = (selector) => document.querySelector(selector);

const els = {
  form: $('#profile-form'),
  alias: $('#lead-alias'),
  region: $('#region'),
  education: $('#education'),
  goal: $('#goal'),
  major: $('#major'),
  workStatus: $('#work-status'),
  weeklyHours: $('#weekly-hours'),
  urgency: $('#urgency'),
  budget: $('#budget'),
  selfDiscipline: $('#self-discipline'),
  examAnxiety: $('#exam-anxiety'),
  disciplineValue: $('#discipline-value'),
  anxietyValue: $('#anxiety-value'),
  notes: $('#notes'),
  aiToggle: $('#ai-toggle'),
  aiOptionText: $('#ai-option-text'),
  generateButton: $('#generate-button'),
  resetButton: $('#reset-button'),
  resultBody: $('#result-body'),
  copyButton: $('#copy-button'),
  saveButton: $('#save-button'),
  serviceState: $('#service-state'),
  connectKeyButton: $('#connect-key-button'),
  keyDialog: $('#key-dialog'),
  keyForm: $('#key-form'),
  closeKeyDialogButton: $('#close-key-dialog'),
  keyInput: $('#key-input'),
  keyRegion: $('#key-region'),
  saveKeyButton: $('#save-key-button'),
  clearKeyButton: $('#clear-key-button'),
  keyDialogStatus: $('#key-dialog-status'),
  focusModeToggle: $('#focus-mode-toggle'),
  focusModeLabel: $('#focus-mode-label'),
  knowledgeStatus: $('#knowledge-status'),
  knowledgeItems: $('#knowledge-items'),
  leadList: $('#lead-list'),
  noLeads: $('#no-leads'),
  exportButton: $('#export-button'),
  clearLeadsButton: $('#clear-leads-button'),
  toast: $('#toast'),
  callConsent: $('#call-consent'),
  startListening: $('#start-listening'),
  stopListening: $('#stop-listening'),
  transcript: $('#call-transcript'),
  livePartial: $('#live-partial'),
  speechState: $('#speech-state'),
  recordDot: $('#record-dot'),
  callDuration: $('#call-duration'),
  callStageDisplay: $('#call-stage-display'),
  callProfileSummary: $('#call-profile-summary'),
  autoCallAnalysis: $('#auto-call-analysis'),
  autoCallAnalysisStatus: $('#auto-call-analysis-status'),
  analyzeCall: $('#analyze-call'),
  callSignals: $('#call-signals'),
  callAdvice: $('#call-advice'),
  callQuestionCard: $('#call-question-card'),
  callRisk: $('#call-risk'),
  copyNextLine: $('#copy-next-line'),
  finishCall: $('#finish-call'),
  copyCallSummary: $('#copy-call-summary'),
  callSummary: $('#call-summary')
};

const STORAGE_KEY = 'admission-ai-copilot-leads-v1';
let service = { mode: 'demo', model: null };
let serverService = { mode: 'demo', status: 'demo', model: null, message: '本地演示模式' };
const browserMiniMax = {
  apiKey: '',
  baseUrl: '',
  region: '',
  verified: false
};
const MINI_MAX_MODEL = 'MiniMax-M3';
const MINI_MAX_BASE_URLS = {
  cn: 'https://api.minimaxi.com/v1',
  global: 'https://api.minimax.io/v1'
};
let lastProfile = null;
let lastResult = null;
let leads = [];
let recognition = null;
let wantsListening = false;
let microphonePermissionRequestInFlight = false;
let microphonePermissionVerified = false;
let lastSpeechErrorMessage = '';
let timerStartedAt = null;
let timerId = null;
let callAnalyzeTimeout = null;
let autoCallAnalyzeTimeout = null;
let autoCallAnalyzeInFlight = false;
let transcriptRevision = 0;
let lastAutoAnalyzedTranscript = '';
let lastAutoAnalyzedAt = 0;
let autoCallAnalysisPaused = false;
let lastCallCoach = null;
let lastCallSummary = '';
let isApplyingProfileUpdates = false;
const profileTouchedFields = new Set();
const AUTO_CALL_ANALYSIS_DELAY_MS = 1800;
const AUTO_CALL_ANALYSIS_MIN_NEW_CHARS = 12;
const AUTO_CALL_ANALYSIS_MIN_INTERVAL_MS = 5000;
let organizationKnowledge = {
  sources: [],
  conversationFramework: ['先确认需求', '资料不足时核验', '约定透明的下一步'],
  blockedTerms: ['包过', '保过', '保录', '保录取', '免考', '免试', '内部名额', '快速拿证', '全日制', '代考'],
  catalogSummary: {
    feeRule: '班型资料尚未复核，不能自动报价。',
    privacyRule: '请勿处理敏感证件或联系方式。',
    approvalRule: '资料不足时须核验。'
  }
};

function cleanText(value, max = 1800) {
  return String(value ?? '')
    .replace(/(?<!\d)1\d{10}(?!\d)/g, '[手机号已隐藏]')
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, '[身份证号已隐藏]')
    .replace(/(?:微信|vx|v信|V信)\s*[:：]?\s*[A-Za-z][-_A-Za-z0-9]{5,}/gi, '[联系方式已隐藏]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function asArray(value, limit = 8) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((item) => cleanText(item, 300)).filter(Boolean);
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setRangeDisplay(input, target) {
  const value = Number(input.value);
  const percent = ((value - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
  input.style.setProperty('--range-progress', `${percent}%`);
  target.textContent = `${value} / 5`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove('show'), 2900);
}

function profileFromForm() {
  const concerns = [...document.querySelectorAll('input[name="concern"]:checked')].map((item) => item.value);
  return {
    alias: cleanText(els.alias.value, 24),
    region: cleanText(els.region.value, 60),
    education: els.education.value || '不确定',
    goal: els.goal.value || '暂不确定',
    major: cleanText(els.major.value, 60),
    workStatus: els.workStatus.value || '未说明',
    weeklyHours: els.weeklyHours.value || '不确定',
    selfDiscipline: Number(els.selfDiscipline.value),
    examAnxiety: Number(els.examAnxiety.value),
    urgency: els.urgency.value || '只是了解',
    budget: els.budget.value || '未说明',
    concerns,
    notes: cleanText(els.notes.value, 1800)
  };
}

function updateCallProfileSummary(profile = profileFromForm()) {
  if (!els.callProfileSummary) return;
  const summary = [
    profile.region,
    profile.education !== '不确定' ? profile.education : '',
    profile.goal !== '暂不确定' ? profile.goal : '',
    profile.workStatus !== '未说明' ? profile.workStatus : ''
  ].filter(Boolean);
  els.callProfileSummary.textContent = summary.length ? summary.join(' · ') : '待补：学历、地区、目标';
  els.callProfileSummary.title = summary.length ? summary.join(' · ') : '待补：最高学历、所在地区、目标';
}

function setFocusMode(active) {
  document.body.classList.toggle('focus-mode', active);
  els.focusModeToggle?.setAttribute('aria-pressed', String(active));
  if (els.focusModeLabel) els.focusModeLabel.textContent = active ? '退出专注' : '专注查看';
  if (active) {
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }
}

function modelProfile(profile) {
  const { alias, ...safeProfile } = profile;
  return safeProfile;
}

function pathRank(profile) {
  const time = { '每周 1–3 小时': 1, '每周 3–6 小时': 2, '每周 6 小时以上': 3, '不确定': 1 }[profile.weeklyHours] || 1;
  const selfStudy = profile.selfDiscipline * 2 + time - profile.examAnxiety;
  const adult = 7 + time - Math.max(0, profile.examAnxiety - 3);
  const open = 5 + (profile.workStatus === '在职' ? 2 : 0) + (profile.examAnxiety >= 4 ? 2 : 0) + (time <= 2 ? 1 : 0);
  return { selfStudy, adult, open };
}

function demoResult(profile) {
  const ranks = pathRank(profile);
  const known = [];
  if (profile.education !== '不确定') known.push(`最高学历：${profile.education}`);
  if (profile.goal !== '暂不确定') known.push(`当前目标：${profile.goal}`);
  if (profile.region) known.push(`所在地区：${profile.region}`);
  if (profile.major) known.push(`意向专业：${profile.major}`);
  if (profile.workStatus !== '未说明') known.push(`目前状态：${profile.workStatus}`);
  if (profile.concerns.length) known.push(`主要顾虑：${profile.concerns.join('、')}`);
  if (!known.length) known.push('已开始收集基础需求，尚缺少足够的判断信息');

  const questions = [];
  if (!profile.region) questions.push('您目前准备在哪个省份报考？不同省份的当期安排需要分别核验。');
  if (profile.education === '不确定') questions.push('您现有的最高学历和取得时间分别是什么？是否能提供对应证明？');
  if (profile.goal === '暂不确定') questions.push('这次提升学历主要用于什么场景？例如职业发展、升本或其他用途。');
  if (!profile.major) questions.push('您有没有倾向专业，或者想避开的课程方向？');
  questions.push('您更希望先了解学习节奏，还是先核验当期可报项目和费用明细？');

  const tracks = [
    {
      key: 'selfStudy',
      name: '自学考试',
      score: ranks.selfStudy,
      reason: [
        `当前自主学习习惯为 ${profile.selfDiscipline}/5，每周可投入时间为“${profile.weeklyHours}”。`,
        '如能接受持续自主复习和阶段性考试，可把它作为优先了解方向。'
      ],
      verify: ['核验所在省、报考层次、专业安排、课程/考试要求和当期通知。']
    },
    {
      key: 'adult',
      name: '成人高考',
      score: ranks.adult,
      reason: [
        `学员目前的目标是“${profile.goal}”，可先把该路径列入比较。`,
        '建议先核验当地当期招生计划、前置学历条件、学习安排和报名流程后再解释。'
      ],
      verify: ['核验当地教育考试主管部门/院校当期计划、资格和收费依据。']
    },
    {
      key: 'open',
      name: '国家开放大学',
      score: ranks.open,
      reason: [
        profile.workStatus === '在职' ? '学员为在职状态，可先了解是否有匹配的当地学习安排。' : '可作为一条备选路径，与其他方案一并核验比较。',
        '重点确认当地可报层次、专业、办学/教学安排及当期要求。'
      ],
      verify: ['核验当地当期项目、办学/教学安排、资格、费用和官方流程。']
    }
  ].sort((a, b) => b.score - a.score).map((track, index) => ({
    name: track.name,
    fit: index === 0 ? '可优先了解' : '可作为备选',
    reason: track.reason,
    verify: track.verify
  }));

  const objections = [];
  const selected = new Set(profile.concerns);
  if (selected.has('担心没时间')) objections.push({
    objection: '“我平时很忙，怕没有时间。”',
    reply: '理解，先不急着给您定方案。我们可以先把您一周实际能稳定安排的时间讲清楚，再核对各路径的学习和考试要求，看看哪种节奏更可持续。'
  });
  if (selected.has('担心考试')) objections.push({
    objection: '“我怕考不过。”',
    reply: '这个担心很正常。我不先给您承诺难度或结果，先按您的基础和可投入时间，把当期课程、考试要求和需要准备的环节核对清楚，再一起判断。'
  });
  if (selected.has('预算问题')) objections.push({
    objection: '“费用大概多少？”',
    reply: '费用需要按当地当期项目逐项核对。我会把官方报名/考试费用、院校收费（如有）和服务项目分开说明，确认后再给您看明确依据。'
  });
  if (selected.has('学历用途')) objections.push({
    objection: '“这个学历以后能不能用于某个用途？”',
    reply: '不同单位、地区和当年岗位规则可能不同，不能一概而论。您可以告诉我具体用途，我们按相关单位当期公告和项目要求逐项核验。'
  });
  if (selected.has('机构资质')) objections.push({
    objection: '“你们机构靠谱吗？”',
    reply: '您问得很对。我们应当把服务主体、可核验的官方资料、收费明细和退款规则讲清楚；涉及院校和项目的信息也应以官方通知为准。'
  });
  if (!objections.length) objections.push({
    objection: '“我先了解一下。”',
    reply: '可以，了解清楚再决定更稳妥。为了不让您看一堆不相关的信息，我先确认您的学历、所在省份和用途，再给您一份需要核验的对比清单。'
  });

  const salutation = profile.alias ? `${profile.alias}，` : '';
  return {
    summary: `目前已整理出基础画像，但尚不能确认具体报名资格、院校/专业、批次、费用或毕业要求。建议先核验本省当期官方资料，再做方案说明。`,
    confirmedFacts: known,
    missingQuestions: [...new Set(questions)].slice(0, 4),
    recommendedTracks: tracks,
    openingMessage: `您好，${salutation}收到您想了解“${profile.goal}”的情况。为了不把方案讲错，我先帮您核实一下现有学历、所在省份和意向专业，再按当期可核验的资料给您做对比。具体资格、费用和流程以当地官方通知及院校审核为准。`,
    consultationScript: `我先不急着推荐某一种方式，想确认 3 点：第一，您目前最高学历和取得时间；第二，准备在哪个省份报；第三，您最想解决的是学习时间、考试压力，还是学历用途。信息确认后，我再把可了解的路径和需要核验的事项说清楚，避免给您错误承诺。`,
    objectionReplies: objections.slice(0, 4),
    followUpPlan: [
      '本次沟通：补齐所在省、最高学历/取得时间、目标专业与具体用途。',
      '核验：只从已审核的当期官方资料中确认项目、资格、费用、流程和退款规则。',
      '下次联系：发送可核验的对比要点，请学员确认最在意的一项后再推进。'
    ],
    complianceChecks: [
      '不要使用“包过、保录、免考、免试、内部名额、快速拿证”等表述。',
      organizationKnowledge.catalogSummary?.feeRule || '费用应拆分说明并给出适用依据；不要用模糊套餐替代明细。',
      '涉及学历用途、资格、毕业或政策时，资料不足就明确转人工/官方核验。'
    ],
    nextAction: questions[0] || '先确认学员现有学历、所在省份和主要用途。'
  };
}

function normalizeResult(value, fallbackProfile) {
  const fallback = demoResult(fallbackProfile);
  if (!value || typeof value !== 'object') return fallback;
  const tracks = Array.isArray(value.recommendedTracks) ? value.recommendedTracks.slice(0, 3).map((track, index) => ({
    name: cleanText(track?.name, 40) || fallback.recommendedTracks[index]?.name || '待核验路径',
    fit: cleanText(track?.fit, 45) || '需核验后确认',
    reason: asArray(track?.reason, 3).length ? asArray(track?.reason, 3) : ['资料不足，需先核验。'],
    verify: asArray(track?.verify, 3).length ? asArray(track?.verify, 3) : ['核验当地当期官方资料和人工审核结果。']
  })) : fallback.recommendedTracks;
  const objections = Array.isArray(value.objectionReplies) ? value.objectionReplies.slice(0, 4).map((item) => ({
    objection: cleanText(item?.objection, 120) || '常见顾虑',
    reply: cleanText(item?.reply, 360) || '请先核验相关资料后再说明。'
  })) : fallback.objectionReplies;
  return {
    summary: cleanText(value.summary, 420) || fallback.summary,
    confirmedFacts: asArray(value.confirmedFacts, 8).length ? asArray(value.confirmedFacts, 8) : fallback.confirmedFacts,
    missingQuestions: asArray(value.missingQuestions, 4).length ? asArray(value.missingQuestions, 4) : fallback.missingQuestions,
    recommendedTracks: tracks,
    openingMessage: cleanText(value.openingMessage, 700) || fallback.openingMessage,
    consultationScript: cleanText(value.consultationScript, 900) || fallback.consultationScript,
    objectionReplies: objections,
    followUpPlan: asArray(value.followUpPlan, 4).length ? asArray(value.followUpPlan, 4) : fallback.followUpPlan,
    complianceChecks: asArray(value.complianceChecks, 4).length ? asArray(value.complianceChecks, 4) : fallback.complianceChecks,
    nextAction: cleanText(value.nextAction, 240) || fallback.nextAction
  };
}

function appendList(container, items) {
  const list = make('ul', 'plain-list');
  items.forEach((item) => list.append(make('li', '', item)));
  container.append(list);
}

function addResultSection(root, badge, title, content) {
  const section = make('section', 'result-section');
  const heading = make('h3');
  heading.append(make('span', 'section-badge', badge), document.createTextNode(title));
  section.append(heading, content);
  root.append(section);
}

function renderResult(result, source = '本地规则模板') {
  els.resultBody.className = 'result-body';
  els.resultBody.replaceChildren();
  const root = make('div', 'result-content');
  root.append(make('div', 'result-summary', result.summary));
  const sourceLabel = make('div', 'generated-label');
  sourceLabel.append(make('i'), document.createTextNode(`${source} · 请人工核验后使用`));
  root.append(sourceLabel);

  const factContent = make('div');
  appendList(factContent, result.confirmedFacts);
  addResultSection(root, 'A', '已确认的需求', factContent);

  const questionContent = make('div');
  appendList(questionContent, result.missingQuestions);
  addResultSection(root, 'B', '优先补问的问题', questionContent);

  const tracks = make('div', 'track-list');
  result.recommendedTracks.forEach((track) => {
    const card = make('article', 'track-card');
    const head = make('header');
    head.append(make('strong', '', track.name), make('span', 'fit-tag', track.fit));
    card.append(head, make('p', '', track.reason.join(' ')));
    card.append(make('span', 'verify', `需核验：${track.verify.join('；')}`));
    tracks.append(card);
  });
  addResultSection(root, 'C', '可先了解的路径', tracks);

  const opening = make('div', 'script-box', result.openingMessage);
  addResultSection(root, 'D', '首条沟通消息', opening);

  const script = make('div', 'script-box', result.consultationScript);
  addResultSection(root, 'E', '需求沟通话术', script);

  const objectionList = make('div', 'objection-list');
  result.objectionReplies.forEach((item) => {
    const objection = make('article', 'objection');
    objection.append(make('strong', '', item.objection), make('p', '', item.reply));
    objectionList.append(objection);
  });
  addResultSection(root, 'F', '异议回应草稿', objectionList);

  const followup = make('div');
  appendList(followup, result.followUpPlan);
  addResultSection(root, 'G', '建议跟进计划', followup);

  const checks = make('div');
  appendList(checks, result.complianceChecks);
  addResultSection(root, 'H', '发送前合规核对', checks);

  const nextAction = make('div', 'next-action');
  nextAction.append(make('span', '', '最合适的下一步'), document.createTextNode(result.nextAction));
  root.append(nextAction);
  els.resultBody.append(root);
  els.copyButton.disabled = false;
  els.saveButton.disabled = false;
}

function renderEmpty() {
  els.resultBody.className = 'result-body empty-state';
  els.resultBody.replaceChildren();
  const illustration = make('div', 'empty-illustration');
  illustration.setAttribute('aria-hidden', 'true');
  illustration.append(make('span'), make('span'), make('span'));
  const rules = make('div', 'empty-rules');
  ['✓ 不替你承诺', '✓ 不夸大政策', '✓ 可人工修改'].forEach((text) => rules.append(make('span', '', text)));
  els.resultBody.append(
    illustration,
    make('h3', '', '从一份真实画像开始'),
    make('p', '', '填写左侧信息后，这里会生成「已确认事实、待补问题、可了解的路径、话术与跟进计划」。'),
    rules
  );
  els.copyButton.disabled = true;
  els.saveButton.disabled = true;
}

function renderLoading(message = '正在整理这位学员的需求…') {
  els.resultBody.className = 'result-body loading-state';
  els.resultBody.replaceChildren(make('div', 'loading-orbit'), make('p', '', message));
}

function resultToText(result) {
  const tracks = result.recommendedTracks.map((track) => `- ${track.name}（${track.fit}）：${track.reason.join(' ')}\n  需核验：${track.verify.join('；')}`).join('\n');
  const objections = result.objectionReplies.map((item) => `- ${item.objection}\n  ${item.reply}`).join('\n');
  return [
    '【招生销售 AI 建议（请人工核验）】',
    result.summary,
    '', '【已确认需求】', ...result.confirmedFacts.map((item) => `- ${item}`),
    '', '【优先补问】', ...result.missingQuestions.map((item) => `- ${item}`),
    '', '【可先了解的路径】', tracks,
    '', '【首条沟通消息】', result.openingMessage,
    '', '【需求沟通话术】', result.consultationScript,
    '', '【异议回应】', objections,
    '', '【跟进计划】', ...result.followUpPlan.map((item) => `- ${item}`),
    '', '【合规核对】', ...result.complianceChecks.map((item) => `- ${item}`),
    '', '【下一步】', result.nextAction
  ].join('\n');
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const helper = document.createElement('textarea');
    helper.value = value;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.append(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
  }
  showToast(successMessage);
}

function hasBrowserMiniMaxConnection() {
  return Boolean(browserMiniMax.verified && browserMiniMax.apiKey && browserMiniMax.baseUrl);
}

function hasAvailableAIService() {
  return hasBrowserMiniMaxConnection()
    || (service.mode === 'ai' && service.status !== 'error');
}

function miniMaxConfigForRegion(value = els.keyRegion?.value) {
  const selected = String(value || 'cn').trim().toLowerCase();
  const isGlobal = selected === 'global'
    || selected === 'international'
    || selected.includes('minimax.io');
  return {
    region: isGlobal ? 'global' : 'cn',
    baseUrl: isGlobal ? MINI_MAX_BASE_URLS.global : MINI_MAX_BASE_URLS.cn
  };
}

function setKeyDialogStatus(message = '', state = '') {
  if (!els.keyDialogStatus) return;
  els.keyDialogStatus.textContent = message;
  els.keyDialogStatus.dataset.state = state;
  els.keyDialogStatus.className = `key-dialog-status${state === 'success' ? ' success' : state === 'error' ? ' error' : ''}`;
}

function setAutoCallAnalysisStatus(message, state = 'idle') {
  if (!els.autoCallAnalysisStatus) return;
  els.autoCallAnalysisStatus.textContent = message;
  els.autoCallAnalysisStatus.dataset.state = state;
}

function autoCallAnalysisIsReady() {
  return Boolean(!autoCallAnalysisPaused && els.autoCallAnalysis?.checked && els.aiToggle?.checked && hasAvailableAIService());
}

function cancelAutoCallAnalysis({ invalidate = false } = {}) {
  window.clearTimeout(autoCallAnalyzeTimeout);
  autoCallAnalyzeTimeout = null;
  if (invalidate) transcriptRevision += 1;
}

function syncAutoCallAnalysisUI() {
  if (!els.autoCallAnalysis) return;
  const hasAI = hasAvailableAIService();
  const canEnable = hasAI && els.aiToggle.checked;
  els.autoCallAnalysis.disabled = !canEnable;
  if (!canEnable && els.autoCallAnalysis.checked) {
    els.autoCallAnalysis.checked = false;
    cancelAutoCallAnalysis({ invalidate: true });
  }
  if (!hasAI) {
    setAutoCallAnalysisStatus('先接入并启用真实 AI，才能开启自动实时分析。');
  } else if (!els.aiToggle.checked) {
    setAutoCallAnalysisStatus('已接入 AI：先打开“使用真实 AI 生成”，再开启自动分析。');
  } else if (autoCallAnalysisPaused && els.autoCallAnalysis.checked) {
    setAutoCallAnalysisStatus('通话已结束，自动实时分析已暂停。');
  } else if (els.autoCallAnalysis.checked && !autoCallAnalyzeInFlight) {
    setAutoCallAnalysisStatus('自动实时 AI 已开启：客户停顿约 2 秒后更新话术。', 'ready');
  } else if (!els.autoCallAnalysis.checked) {
    setAutoCallAnalysisStatus('自动模式关闭：仍会给出本地即时提示。');
  }
}

function renderServiceState({ resetToggle = false } = {}) {
  const browserMode = service.mode === 'browser' && hasBrowserMiniMaxConnection();
  const hasAI = browserMode || (service.mode === 'ai' && service.status !== 'error');
  const hasConfigError = service.status === 'error';
  const stateText = browserMode
    ? '当前页面已接入 MiniMax M3'
    : hasAI
      ? `真实模型已连接 · ${service.model || '模型'}`
      : hasConfigError
        ? '模型密钥待更新'
        : '本地演示模式';
  els.serviceState.className = `service-state ${hasAI ? 'ready' : hasConfigError ? 'error' : 'demo'}`;
  els.serviceState.replaceChildren(make('span', 'status-dot'), document.createTextNode(stateText));
  els.aiToggle.disabled = !hasAI;
  if (!hasAI || resetToggle) els.aiToggle.checked = false;
  els.aiOptionText.textContent = browserMode
    ? '临时接入的 MiniMax M3（刷新页面后需重新接入）'
    : hasAI
      ? `已连接 ${service.model || '模型'}`
      : hasConfigError
        ? (service.message || '模型密钥待更新，当前使用本地演示')
        : '未配置 API，当前使用本地演示';
  syncAutoCallAnalysisUI();
}

function openKeyDialog() {
  if (!els.keyDialog) return;
  setKeyDialogStatus('密钥仅保存在当前页面；刷新或重新打开后会清空。');
  if (typeof els.keyDialog.showModal === 'function' && !els.keyDialog.open) els.keyDialog.showModal();
  else els.keyDialog.hidden = false;
  window.setTimeout(() => els.keyInput?.focus(), 0);
}

function closeKeyDialog() {
  if (!els.keyDialog) return;
  if (typeof els.keyDialog.close === 'function' && els.keyDialog.open) els.keyDialog.close();
  else els.keyDialog.hidden = true;
}

function clearBrowserMiniMaxConnection({ quiet = false } = {}) {
  browserMiniMax.apiKey = '';
  browserMiniMax.baseUrl = '';
  browserMiniMax.region = '';
  browserMiniMax.verified = false;
  if (els.keyInput) els.keyInput.value = '';
  if (service.mode === 'browser') service = { ...serverService };
  renderServiceState({ resetToggle: true });
  if (!quiet) {
    setKeyDialogStatus('已清除临时接入信息。刷新或关闭页面也会自动清空。', 'idle');
    showToast('已清除当前页面的 MiniMax M3 连接。');
  }
}

function connectionErrorMessage(responseStatus) {
  if (responseStatus === 401 || responseStatus === 403) return '密钥无效，或选择的服务区域不匹配。';
  if (responseStatus === 429) return '请求过于频繁，请稍后再试。';
  if (responseStatus >= 500) return 'MiniMax 服务暂时不可用，请稍后再试。';
  return '暂时无法验证连接，请检查网络、区域和密钥后重试。';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('连接超时，请稍后重试。');
    throw new Error('浏览器无法连接 MiniMax 服务，请检查网络或浏览器的跨域限制。');
  } finally {
    window.clearTimeout(timer);
  }
}

async function validateBrowserMiniMaxKey(apiKey, baseUrl) {
  const response = await fetchWithTimeout(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store'
  }, 15000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(connectionErrorMessage(response.status));
  const models = Array.isArray(payload?.data) ? payload.data : [];
  const hasM3 = models.some((item) => String(item?.id || item?.model || '') === MINI_MAX_MODEL);
  if (!hasM3) throw new Error('该服务区域未检测到 MiniMax M3，请切换区域或确认该密钥权限。');
}

async function connectBrowserMiniMax() {
  const apiKey = String(els.keyInput?.value || '').trim();
  if (!apiKey) {
    setKeyDialogStatus('请输入 MiniMax API 密钥后再验证。', 'error');
    els.keyInput?.focus();
    return;
  }
  const { region, baseUrl } = miniMaxConfigForRegion();
  if (els.saveKeyButton) {
    els.saveKeyButton.disabled = true;
    els.saveKeyButton.textContent = '验证中…';
  }
  setKeyDialogStatus('正在验证 MiniMax M3 连接…', 'loading');
  try {
    await validateBrowserMiniMaxKey(apiKey, baseUrl);
    browserMiniMax.apiKey = apiKey;
    browserMiniMax.baseUrl = baseUrl;
    browserMiniMax.region = region;
    browserMiniMax.verified = true;
    if (els.keyInput) els.keyInput.value = '';
    service = {
      mode: 'browser',
      status: 'ready',
      model: MINI_MAX_MODEL,
      message: '当前页面已接入 MiniMax M3'
    };
    renderServiceState();
    els.aiToggle.checked = true;
    syncAutoCallAnalysisUI();
    setKeyDialogStatus('MiniMax M3 已接入当前页面；刷新页面后需要重新输入。', 'success');
    showToast('MiniMax M3 已临时接入，可开始生成。');
    window.setTimeout(closeKeyDialog, 420);
  } catch (error) {
    setKeyDialogStatus(error.message || '验证失败，请稍后重试。', 'error');
  } finally {
    if (els.saveKeyButton) {
      els.saveKeyButton.disabled = false;
      els.saveKeyButton.textContent = '验证并接入';
    }
  }
}

function normalizedModelText(content) {
  const source = Array.isArray(content)
    ? content.map((part) => typeof part === 'string' ? part : (typeof part?.text === 'string' ? part.text : (typeof part?.content === 'string' ? part.content : ''))).join('')
    : (typeof content === 'string' ? content : (typeof content?.text === 'string' ? content.text : (typeof content?.content === 'string' ? content.content : '')));
  return source
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

function parseModelJson(content) {
  const text = normalizedModelText(content);
  try {
    return JSON.parse(text);
  } catch (error) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw error;
  }
}

function browserKnowledgeGuardrail() {
  const blocked = asArray(organizationKnowledge.blockedTerms, 24).join('、') || '包过、保录、免考、免试、内部名额、快速拿证、全日制、代考';
  const feeRule = cleanText(organizationKnowledge.catalogSummary?.feeRule, 220) || '未核验前禁止自动报价。';
  const approvalRule = cleanText(organizationKnowledge.catalogSummary?.approvalRule, 220) || '资料不足时转人工或核验官方来源。';
  return `\n资料边界：当前页面没有可直接对外发布的项目事实。${feeRule}${approvalRule} 禁用表述：${blocked}。`;
}

function browserConsultationSystemPrompt() {
  return `你是成人学历提升招生销售副驾。只根据已脱敏的画像生成可人工审核的沟通草稿，不代表院校或主管部门作出承诺。

必须遵守：
1. 不得编造或确认资格、招生日期、院校专业、费用、优惠、学制、录取、毕业或学历用途；资料不足时明确“需要核验”。
2. 禁止包过、保录、免考、免试、内部名额、快速拿证、全日制、代考等承诺；不施压、不制造虚假紧迫感。
3. 不索取或复述手机号、身份证、银行卡、证件影像、精确住址等敏感信息。
4. 面向学员的内容必须提醒“具体资格、费用、流程以当地官方通知及院校审核为准”，费用必须分项透明。
5. 只输出一个合法 JSON 对象，禁止 Markdown 或解释。输出前检查引号、逗号、数组和对象闭合。

固定 JSON：
{
  "summary":"明确区分已知和待核验",
  "confirmedFacts":["..."],
  "missingQuestions":["最多4个优先补问"],
  "recommendedTracks":[{"name":"自学考试/成人高考/国家开放大学","fit":"可优先了解/可作为备选/暂不建议直接确认","reason":["..."],"verify":["需核验事项"]}],
  "openingMessage":"可发给学员的首条消息",
  "consultationScript":"一段合规需求沟通话术",
  "objectionReplies":[{"objection":"顾虑","reply":"合规回应"}],
  "followUpPlan":["2-4个动作"],
  "complianceChecks":["发送前核对"],
  "nextAction":"一个最合适的下一步"
}${browserKnowledgeGuardrail()}`;
}

function browserCallSystemPrompt() {
  return `你是成人学历提升咨询机构的电销实时通话副驾。分析已脱敏的通话文字，只给销售一条自然、合规的下一句建议；不替销售自动说话、发送消息、报价或承诺。

必须遵守：
1. 不得编造或确认资格、院校/专业、批次、价格、优惠、学历用途、通过率、录取、毕业时间；资料不足时说“需要核验”。
2. 禁止包过、保录、免考、免试、内部名额、快速拿证、全日制、代报名、代学、替考等承诺或暗示。
3. 不要索取或复述手机号、微信号、身份证、银行卡、验证码、证件材料；不要因年龄、性别等无关信息作判断。
4. profileUpdates 只记录客户在本段通话明确说出的非敏感事实；不可根据既有画像、销售说法或常识推测。没有明确说出的字段必须为空字符串，concerns 必须为空数组。枚举字段只能逐字使用下方列出的选项；不要写“近期”“3-6小时”“费用别太高”等自由文本，不能匹配时留空。
5. 只输出一个合法 JSON 对象，禁止 Markdown 或解释。输出前检查 JSON 闭合。

固定 JSON：
{
  "stage":"需求澄清/费用核验/考试顾虑/学习节奏/建立信任/用途核验/方案比较/报名时点核验/高风险澄清等",
  "signals":["最多4个信号"],
  "profileUpdates":{"region":"","education":"仅可为初中及以下/高中/中专/大专/本科及以上之一或空字符串","goal":"仅可为专升本/高起专/第二学历/职业发展之一或空字符串","major":"","workStatus":"仅可为在职/待业/求职/全职带娃/学生/其他之一或空字符串","weeklyHours":"仅可为每周 1–3 小时/每周 3–6 小时/每周 6 小时以上之一或空字符串","urgency":"仅可为近期要报名/3–6 个月内/半年以后/只是了解之一或空字符串","budget":"仅可为预算敏感/可比较方案/以适合为主之一或空字符串","concerns":["仅可为担心没时间/担心考试/预算问题/学历用途/专业选择/机构资质"]},
  "nextLine":"销售可说的下一句，不超过110字",
  "nextQuestion":"一个自然追问，不超过70字",
  "risk":"必须避免或核验的事项，不超过100字",
  "summarySnippet":"供CRM使用的匿名摘要，只写已知和待核验",
  "nextAction":"通话后一个明确动作"
}${browserKnowledgeGuardrail()}`;
}

async function browserModelCompletion({ system, user, temperature = 0.3, maxCompletionTokens = 2400, includeThinkingControl = true, retryOnEmpty = true, retryOnTransient = true }) {
  if (!hasBrowserMiniMaxConnection()) throw new Error('请先接入 MiniMax Key。');
  const body = {
    model: MINI_MAX_MODEL,
    temperature,
    max_completion_tokens: maxCompletionTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  };
  if (includeThinkingControl) body.thinking = { type: 'disabled' };
  const response = await fetchWithTimeout(`${browserMiniMax.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${browserMiniMax.apiKey}`
    },
    body: JSON.stringify(body)
  }, 60000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 400 && includeThinkingControl) {
      return browserModelCompletion({ system, user, temperature, maxCompletionTokens, includeThinkingControl: false, retryOnEmpty, retryOnTransient });
    }
    if (retryOnTransient && [429, 500, 502, 503, 504, 529].includes(response.status)) {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      return browserModelCompletion({ system, user, temperature, maxCompletionTokens, includeThinkingControl, retryOnEmpty, retryOnTransient: false });
    }
    throw new Error(connectionErrorMessage(response.status));
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!normalizedModelText(content)) {
    if (retryOnEmpty) return browserModelCompletion({ system, user, temperature, maxCompletionTokens, includeThinkingControl, retryOnEmpty: false, retryOnTransient });
    throw new Error('MiniMax 未返回可用内容，请重试。');
  }
  return content;
}

async function browserModelJson(input) {
  const content = await browserModelCompletion(input);
  try {
    return parseModelJson(content);
  } catch {
    throw new Error('MiniMax 返回格式不完整，请重试。');
  }
}

async function generateWithBrowserMiniMax(profile) {
  return browserModelJson({
    system: browserConsultationSystemPrompt(),
    user: `以下是已脱敏的学员画像。请输出销售副驾草稿：\n${JSON.stringify(modelProfile(profile))}`,
    temperature: 0.35,
    maxCompletionTokens: 3600
  });
}

async function callCoachWithBrowserMiniMax(profile, transcript) {
  return browserModelJson({
    system: browserCallSystemPrompt(),
    user: `已脱敏的学员画像：${JSON.stringify(modelProfile(profile))}\n\n已脱敏的最新通话转写：\n${cleanText(transcript, 8000)}`,
    temperature: 0.3,
    maxCompletionTokens: 2400
  });
}

async function fetchServiceHealth() {
  let nextService;
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (!response.ok) throw new Error('health failed');
    nextService = await response.json();
  } catch {
    nextService = { mode: 'demo', status: 'demo', model: null, message: '本地演示模式' };
  }
  serverService = { ...nextService };
  if (!hasBrowserMiniMaxConnection()) service = { ...serverService };
  renderServiceState({ resetToggle: !hasBrowserMiniMaxConnection() });
}

function renderKnowledgeStatus() {
  if (!els.knowledgeStatus || !els.knowledgeItems) return;
  const sources = Array.isArray(organizationKnowledge.sources) ? organizationKnowledge.sources : [];
  const framework = Array.isArray(organizationKnowledge.conversationFramework)
    ? organizationKnowledge.conversationFramework.slice(0, 4)
    : [];
  const heading = els.knowledgeStatus.querySelector('.knowledge-heading p');
  if (heading) heading.textContent = sources.length
    ? '已按“流程参考 / 待复核目录”分层导入，不会自动报价或承诺。'
    : '当前使用安全默认规则，未加载可直接对外使用的项目事实。';
  els.knowledgeItems.replaceChildren();
  sources.forEach((source) => {
    const item = make('article', 'knowledge-item');
    item.append(
      make('strong', '', source.title || '机构资料'),
      make('span', 'knowledge-tag', source.status || '需核验'),
      make('p', '', `${source.role || '内部参考'}${source.sourceDate ? ` · ${source.sourceDate}` : ''}`)
    );
    els.knowledgeItems.append(item);
  });
  if (framework.length) {
    const flow = make('div', 'knowledge-flow');
    flow.append(make('span', '', '电销流程'));
    framework.forEach((step, index) => {
      if (index) flow.append(make('i', '', '→'));
      flow.append(make('b', '', step));
    });
    els.knowledgeItems.append(flow);
  }
}

async function fetchKnowledgeStatus() {
  try {
    const response = await fetch('/api/knowledge', { cache: 'no-store' });
    if (!response.ok) throw new Error('knowledge unavailable');
    organizationKnowledge = { ...organizationKnowledge, ...(await response.json()) };
  } catch {
    // Local rules deliberately stay conservative when the knowledge file is unavailable.
  }
  renderKnowledgeStatus();
}

async function generateWithAI(profile) {
  if (hasBrowserMiniMaxConnection()) return generateWithBrowserMiniMax(profile);
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: modelProfile(profile) })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '模型服务暂时不可用');
  return payload.result;
}

async function handleGenerate(event) {
  event.preventDefault();
  if (!els.form.checkValidity()) {
    els.form.reportValidity();
    return;
  }
  const profile = profileFromForm();
  lastProfile = profile;
  updateCallProfileSummary(profile);
  lastResult = null;
  els.generateButton.disabled = true;
  els.generateButton.textContent = '正在生成…';
  const usingAI = els.aiToggle.checked && hasAvailableAIService();
  renderLoading(usingAI ? '正在生成可审核的 AI 草稿…' : '正在按合规规则整理建议…');
  try {
    let source = '本地规则 + 机构流程参考';
    let draft;
    if (usingAI) {
      draft = await generateWithAI(profile);
      source = hasBrowserMiniMaxConnection() ? '临时接入 · MiniMax M3' : `真实 AI · ${service.model}`;
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 320));
      draft = demoResult(profile);
    }
    lastResult = normalizeResult(draft, profile);
    renderResult(lastResult, source);
    showToast('咨询建议已生成，请先核验后再发送。');
  } catch (error) {
    lastResult = demoResult(profile);
    renderResult(lastResult, '本地规则模板（模型暂不可用）');
    showToast(`${error.message}；已切换为本地模板。`);
  } finally {
    els.generateButton.disabled = false;
    els.generateButton.innerHTML = '<span aria-hidden="true">✦</span> 生成咨询建议';
  }
}

function loadLeads() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    leads = Array.isArray(stored) ? stored.slice(0, 100) : [];
  } catch {
    leads = [];
  }
  renderLeads();
}

function persistLeads() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads.slice(0, 100)));
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  } catch {
    return value;
  }
}

function renderLeads() {
  els.leadList.replaceChildren();
  els.noLeads.hidden = leads.length > 0;
  leads.forEach((lead) => {
    const row = document.createElement('tr');
    const columns = [
      cleanText(lead.profile?.alias, 24) || '未命名学员',
      `${cleanText(lead.profile?.goal, 40) || '目标待确认'}${lead.profile?.region ? ` · ${cleanText(lead.profile.region, 40)}` : ''}`,
      cleanText(lead.result?.recommendedTracks?.[0]?.name, 40) || '待核验',
      cleanText(lead.result?.nextAction, 90) || '待确认下一步',
      formatDate(lead.savedAt)
    ];
    columns.forEach((value) => row.append(make('td', '', value)));
    const actionCell = make('td');
    const loadButton = make('button', 'table-action', '载入');
    loadButton.type = 'button';
    loadButton.addEventListener('click', () => loadLead(lead.id));
    actionCell.append(loadButton);
    row.append(actionCell);
    els.leadList.append(row);
  });
}

function saveCurrentLead() {
  if (!lastProfile || !lastResult) return;
  const entry = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    savedAt: new Date().toISOString(),
    profile: lastProfile,
    result: lastResult
  };
  leads.unshift(entry);
  leads = leads.slice(0, 100);
  persistLeads();
  renderLeads();
  showToast('已保存到当前浏览器的待跟进列表。');
}

function setFormProfile(profile) {
  els.alias.value = profile.alias || '';
  els.region.value = profile.region || '';
  els.education.value = profile.education || '';
  els.goal.value = profile.goal || '';
  els.major.value = profile.major || '';
  els.workStatus.value = profile.workStatus || '未说明';
  els.weeklyHours.value = profile.weeklyHours || '不确定';
  els.urgency.value = profile.urgency || '只是了解';
  els.budget.value = profile.budget || '未说明';
  els.selfDiscipline.value = profile.selfDiscipline || 3;
  els.examAnxiety.value = profile.examAnxiety || 3;
  setRangeDisplay(els.selfDiscipline, els.disciplineValue);
  setRangeDisplay(els.examAnxiety, els.anxietyValue);
  els.notes.value = profile.notes || '';
  const wanted = new Set(profile.concerns || []);
  document.querySelectorAll('input[name="concern"]').forEach((input) => { input.checked = wanted.has(input.value); });
  updateCallProfileSummary(profile);
}

function loadLead(id) {
  const lead = leads.find((item) => item.id === id);
  if (!lead) return;
  setFormProfile(lead.profile || {});
  lastProfile = lead.profile;
  lastResult = normalizeResult(lead.result, lastProfile);
  renderResult(lastResult, '本机已保存记录');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('已载入线索。');
}

function exportLeads() {
  if (!leads.length) {
    showToast('没有可导出的待跟进记录。');
    return;
  }
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [
    ['学员备注', '所在省市', '目标', '最高学历', '首选了解路径', '下一步', '保存时间'],
    ...leads.map((lead) => [
      lead.profile?.alias || '', lead.profile?.region || '', lead.profile?.goal || '', lead.profile?.education || '',
      lead.result?.recommendedTracks?.[0]?.name || '', lead.result?.nextAction || '', lead.savedAt || ''
    ])
  ];
  const content = `\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `待跟进线索_${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast('待跟进线索已导出。');
}

function clearLeads() {
  if (!leads.length) return;
  if (!window.confirm('确认清空当前浏览器保存的全部待跟进线索？此操作无法恢复。')) return;
  leads = [];
  persistLeads();
  renderLeads();
  showToast('已清空本机待跟进记录。');
}

function humanDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function refreshTimer() {
  if (timerStartedAt) els.callDuration.textContent = humanDuration(Date.now() - timerStartedAt);
}

function setListeningUI(active, text) {
  els.startListening.disabled = active || !speechRecognitionSupported();
  els.stopListening.disabled = !active;
  els.recordDot.classList.toggle('live', active);
  els.speechState.textContent = text;
}

function speechRecognitionSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function microphonePermissionMessage(error) {
  const messages = {
    NotAllowedError: '麦克风权限被拒绝，请允许当前浏览器或 ChatGPT 使用麦克风。',
    PermissionDeniedError: '麦克风权限被拒绝，请允许当前浏览器或 ChatGPT 使用麦克风。',
    NotFoundError: '未找到可用麦克风，请检查耳机或电脑的输入设备。',
    DevicesNotFoundError: '未找到可用麦克风，请检查耳机或电脑的输入设备。',
    NotReadableError: '麦克风可能正被其他应用占用，请关闭占用麦克风的应用后重试。',
    TrackStartError: '麦克风可能正被其他应用占用，请关闭占用麦克风的应用后重试。',
    SecurityError: '当前页面无法请求麦克风权限，请改用受支持的浏览器。'
  };
  return messages[error?.name] || '无法访问麦克风，请检查系统和浏览器的麦克风权限。';
}

async function requestMicrophonePermission() {
  const getUserMedia = navigator.mediaDevices?.getUserMedia;
  if (typeof getUserMedia !== 'function') return true;

  microphonePermissionRequestInFlight = true;
  els.startListening.disabled = true;
  els.stopListening.disabled = true;
  els.recordDot.classList.remove('live');
  els.speechState.textContent = '正在请求麦克风权限…';

  try {
    // 只用于触发并验证权限：立即释放音轨，不保存、不上传任何原始音频。
    const stream = await getUserMedia.call(navigator.mediaDevices, { audio: true });
    stream.getTracks().forEach((track) => track.stop());
    microphonePermissionVerified = true;
    return true;
  } catch (error) {
    const message = microphonePermissionMessage(error);
    setListeningUI(false, message);
    showToast(message);
    return false;
  } finally {
    microphonePermissionRequestInFlight = false;
  }
}

function initRecognition() {
  if (recognition || !speechRecognitionSupported()) return;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new Recognition();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    lastSpeechErrorMessage = '';
    if (!timerStartedAt) {
      timerStartedAt = Date.now();
      timerId = window.setInterval(refreshTimer, 1000);
    }
    setListeningUI(true, '正在麦克风转写');
  };
  recognition.onresult = (event) => {
    let interim = '';
    const finalParts = [];
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const phrase = event.results[index][0]?.transcript || '';
      if (event.results[index].isFinal) finalParts.push(phrase.trim());
      else interim += phrase;
    }
    if (finalParts.length) {
      const existing = els.transcript.value.trim();
      els.transcript.value = `${existing}${existing ? '\n' : ''}${finalParts.join(' ')}`.slice(-8000);
      handleTranscriptChange();
    }
    els.livePartial.textContent = interim ? `正在识别：${interim}` : '';
  };
  recognition.onerror = (event) => {
    const messages = {
      'not-allowed': '浏览器未允许语音转写，请使用 Chrome 或 Edge 打开本页并允许麦克风。',
      'service-not-allowed': '当前浏览器不允许使用语音转写服务，请改用 Chrome 或 Edge。',
      'no-speech': '暂未识别到语音',
      'audio-capture': '未找到可用麦克风',
      network: '转写服务网络异常'
    };
    const message = messages[event.error] || `转写异常：${event.error}`;
    if (event.error !== 'no-speech') wantsListening = false;
    lastSpeechErrorMessage = message;
    setListeningUI(false, message);
  };
  recognition.onend = () => {
    els.livePartial.textContent = '';
    if (wantsListening) {
      window.setTimeout(() => {
        try { recognition.start(); } catch { /* browser may still be stopping */ }
      }, 260);
    } else {
      setListeningUI(false, lastSpeechErrorMessage || '已停止转写');
    }
  };
}

async function startListening() {
  if (!els.callConsent.checked) {
    showToast('请先确认已完成通话实时转写所需的告知与授权。');
    return;
  }
  if (!speechRecognitionSupported()) {
    showToast('当前浏览器不支持麦克风转写，可粘贴电话系统转写内容。');
    return;
  }
  if (microphonePermissionRequestInFlight) return;
  if (!microphonePermissionVerified) {
    const hasMicrophonePermission = await requestMicrophonePermission();
    if (!hasMicrophonePermission) return;
    // 部分 macOS 内置浏览器在权限弹窗关闭后会丢失首次点击的用户手势；第二次点击可可靠启动转写。
    setListeningUI(false, '麦克风权限已开启，请再点击一次“开始麦克风转写”。');
    showToast('麦克风权限已开启，请再点击一次“开始麦克风转写”。');
    return;
  }
  initRecognition();
  wantsListening = true;
  try {
    recognition.start();
  } catch {
    wantsListening = false;
    const message = '当前浏览器无法启动语音转写，请改用 Chrome 或 Edge，或粘贴电话系统转写。';
    setListeningUI(false, message);
    showToast(message);
  }
}

function stopListening() {
  wantsListening = false;
  lastSpeechErrorMessage = '';
  if (recognition) {
    try { recognition.stop(); } catch { /* ignore */ }
  }
  if (timerId) window.clearInterval(timerId);
  timerId = null;
  setListeningUI(false, '已停止转写');
}

function transcriptSignals(text) {
  const patterns = [
    ['费用顾虑', /贵|钱|费用|价格|收费|预算|付款|分期/],
    ['时间顾虑', /没时间|忙|加班|上班|孩子|抽不出/],
    ['考试焦虑', /考不过|怕考|考试|难不难|挂科/],
    ['信任核验', /靠谱吗|骗子|资质|官方|官网|可靠吗/],
    ['正在比较', /别家|其他机构|对比|看看|考虑一下/],
    ['用途咨询', /学信网|考公|考编|职称|落户|认可|用途/],
    ['报名时点', /报名|截止|什么时候|来得及|批次/]
  ];
  const signals = patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  const blockedTerms = Array.isArray(organizationKnowledge.blockedTerms) ? organizationKnowledge.blockedTerms : [];
  if (blockedTerms.some((term) => term && text.includes(term))) signals.push('高风险表述');
  return [...new Set(signals)];
}

const profileUpdateLabels = {
  region: '地区',
  education: '学历',
  goal: '目标',
  major: '意向专业',
  workStatus: '状态',
  weeklyHours: '学习时间',
  urgency: '决定时间',
  budget: '预算倾向',
  concerns: '顾虑'
};

function canonicalProfileValue(field, value) {
  const text = cleanText(value, 80);
  if (!text) return '';
  const compact = text.replace(/\s+/g, '').replace(/[－—~至]/g, '-');
  const aliases = {
    education: { '初中': '初中及以下', '高中': '高中/中专', '中专': '高中/中专', '专科': '大专', '本科': '本科及以上' },
    workStatus: { '待业': '待业/求职', '求职': '待业/求职', '找工作': '待业/求职', '上班': '在职' },
    goal: {},
    weeklyHours: {},
    urgency: {},
    budget: {}
  };
  const permitted = {
    education: ['初中及以下', '高中/中专', '大专', '本科及以上'],
    goal: ['专升本', '高起专', '第二学历', '职业发展'],
    workStatus: ['在职', '待业/求职', '全职带娃', '学生', '其他'],
    weeklyHours: ['每周 1–3 小时', '每周 3–6 小时', '每周 6 小时以上'],
    urgency: ['近期要报名', '3–6 个月内', '半年以后', '只是了解'],
    budget: ['预算敏感', '可比较方案', '以适合为主']
  };
  const normalized = aliases[field]?.[text] || text;
  if (permitted[field]?.includes(normalized)) return normalized;

  if (field === 'education') {
    if (/初中/.test(compact)) return '初中及以下';
    if (/(高中|中专)/.test(compact)) return '高中/中专';
    if (/(大专|专科)/.test(compact)) return '大专';
    if (/本科/.test(compact)) return '本科及以上';
  }
  if (field === 'goal') {
    if (/(专升本|专科升本|升本科)/.test(compact)) return '专升本';
    if (/(高起专|高中起专)/.test(compact)) return '高起专';
    if (/第二学历/.test(compact)) return '第二学历';
    if (/职业发展/.test(compact)) return '职业发展';
  }
  if (field === 'workStatus') {
    if (/(在职|上班|工作中)/.test(compact)) return '在职';
    if (/(待业|求职|找工作)/.test(compact)) return '待业/求职';
    if (/全职带娃/.test(compact)) return '全职带娃';
    if (/学生/.test(compact)) return '学生';
  }
  if (field === 'weeklyHours') {
    if (/(?:1|一)-(?:3|三)(?:小时|h)/i.test(compact)) return '每周 1–3 小时';
    if (/(?:3|三)-(?:6|六)(?:小时|h)/i.test(compact)) return '每周 3–6 小时';
    if (/(?:6|六)(?:小时|h).*(?:以上|多)/i.test(compact)) return '每周 6 小时以上';
  }
  if (field === 'urgency') {
    if (/(近期|尽快|马上|这两天|最近).*(?:报名|报考|决定)?/.test(compact)) return '近期要报名';
    if (/(?:3|三)-(?:6|六)(?:个)?月/.test(compact)) return '3–6 个月内';
    if (/(半年|6个?月以后|六个?月以后)/.test(compact)) return '半年以后';
    if (/(只是了解|了解一下|先看看)/.test(compact)) return '只是了解';
  }
  if (field === 'budget') {
    if (/(预算|费用|价格|贵|便宜|不高|太高)/.test(compact)) return '预算敏感';
    if (/(比较|对比)/.test(compact)) return '可比较方案';
    if (/(适合|合适)/.test(compact)) return '以适合为主';
  }
  return '';
}

function canonicalProfileConcern(value) {
  const text = cleanText(value, 80);
  const permitted = ['担心没时间', '担心考试', '预算问题', '学历用途', '专业选择', '机构资质'];
  if (permitted.includes(text)) return text;
  if (/(时间|忙|没空)/.test(text)) return '担心没时间';
  if (/(考试|通过|难度)/.test(text)) return '担心考试';
  if (/(预算|费用|价格|贵|便宜)/.test(text)) return '预算问题';
  if (/(用途|认可|考公|考编|落户)/.test(text)) return '学历用途';
  if (/(专业|选什么)/.test(text)) return '专业选择';
  if (/(机构|资质|正规|信任|骗子)/.test(text)) return '机构资质';
  return '';
}

function normalizeProfileUpdates(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    region: cleanText(input.region, 60),
    education: canonicalProfileValue('education', input.education),
    goal: canonicalProfileValue('goal', input.goal),
    major: cleanText(input.major, 60),
    workStatus: canonicalProfileValue('workStatus', input.workStatus),
    weeklyHours: canonicalProfileValue('weeklyHours', input.weeklyHours),
    urgency: canonicalProfileValue('urgency', input.urgency),
    budget: canonicalProfileValue('budget', input.budget),
    concerns: [...new Set(asArray(input.concerns, 6).map(canonicalProfileConcern).filter(Boolean))]
  };
}

function profileFieldIsAvailable(element, field, emptyValues = []) {
  if (!element || profileTouchedFields.has(field)) return false;
  const value = String(element.value || '').trim();
  return !value || emptyValues.includes(value);
}

function applyProfileUpdates(updates) {
  const next = normalizeProfileUpdates(updates);
  const changed = [];
  const assign = (element, field, emptyValues = []) => {
    const value = next[field];
    if (!value || !profileFieldIsAvailable(element, field, emptyValues)) return;
    element.value = value;
    changed.push(profileUpdateLabels[field]);
  };

  isApplyingProfileUpdates = true;
  try {
    assign(els.region, 'region');
    assign(els.education, 'education', ['不确定']);
    assign(els.goal, 'goal', ['暂不确定']);
    assign(els.major, 'major');
    assign(els.workStatus, 'workStatus', ['未说明']);
    assign(els.weeklyHours, 'weeklyHours', ['不确定']);
    assign(els.urgency, 'urgency', ['只是了解']);
    assign(els.budget, 'budget', ['未说明']);
    const hasConcern = Boolean(document.querySelector('input[name="concern"]:checked'));
    if (next.concerns.length && !hasConcern && !profileTouchedFields.has('concerns')) {
      next.concerns.forEach((value) => {
        const input = document.querySelector(`input[name="concern"][value="${CSS.escape(value)}"]`);
        if (input) input.checked = true;
      });
      changed.push(profileUpdateLabels.concerns);
    }
  } finally {
    isApplyingProfileUpdates = false;
  }
  if (changed.length) {
    lastProfile = profileFromForm();
    updateCallProfileSummary(lastProfile);
  }
  return [...new Set(changed)];
}

function profileUpdateFieldForElement(element) {
  if (!element) return '';
  if (element.name === 'concern') return 'concerns';
  return {
    region: 'region',
    education: 'education',
    goal: 'goal',
    major: 'major',
    'work-status': 'workStatus',
    'weekly-hours': 'weeklyHours',
    urgency: 'urgency',
    budget: 'budget'
  }[element.id] || '';
}

function markProfileFieldAsManual(event) {
  if (isApplyingProfileUpdates) return;
  const field = profileUpdateFieldForElement(event.target);
  if (field) profileTouchedFields.add(field);
}

function localProfileUpdatesFromTranscript(transcript) {
  const clientText = String(transcript ?? '')
    .split(/\r?\n/)
    .map((line) => cleanText(line, 1200))
    .filter((line) => line && !/^\s*(销售|客服|老师)\s*[:：]/.test(line))
    .join(' ');
  const updates = { region: '', education: '', goal: '', major: '', workStatus: '', weeklyHours: '', urgency: '', budget: '', concerns: [] };
  const regionNames = '北京|天津|上海|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆|香港|澳门';
  const regionMatch = clientText.match(new RegExp(`(?:我(?:现在|目前)?(?:在|来自)|(?:所在|报名|报考)(?:地区|省市)(?:是|为)?)[，,、\\s]*(${regionNames})(?:省|市|自治区|特别行政区)?`));
  if (regionMatch) updates.region = regionMatch[1];
  const educationMatch = clientText.match(/(?:我(?:现在|目前)?(?:在[^。！？]{0,12})?[，,、\s]*(?:是|有|读的是)|(?:我的|最高)?学历(?:是|为)?)\s*(初中及以下|初中|高中|中专|大专|专科|本科及以上|本科)/);
  if (educationMatch) updates.education = educationMatch[1];
  const goalMatch = clientText.match(/(?:想|准备|打算|要)(?:报|读|升)?[^。！？，,]{0,5}(专升本|高起专|第二学历|职业发展)/);
  if (goalMatch) updates.goal = goalMatch[1];
  const workMatch = clientText.match(/(?:我(?:现在|目前)?[^。！？]{0,12}?|目前\s*)[，,、\s]*(在职|上班|待业|求职|找工作|全职带娃|学生)/);
  if (workMatch) updates.workStatus = workMatch[1];
  const weeklyMap = [
    ['每周 1–3 小时', /(?:每周|一周).{0,5}(?:1|一)\s*(?:到|[-—~至])\s*(?:3|三)\s*(?:小时|h)/],
    ['每周 3–6 小时', /(?:每周|一周).{0,5}(?:3|三)\s*(?:到|[-—~至])\s*(?:6|六)\s*(?:小时|h)/],
    ['每周 6 小时以上', /(?:每周|一周).{0,7}(?:6|六)\s*(?:小时|h).{0,4}(?:以上|多|左右)/]
  ];
  updates.weeklyHours = weeklyMap.find(([, pattern]) => pattern.test(clientText))?.[0] || '';
  if (/(?:近期|最近|这两天|尽快|马上).{0,12}(?:报名|报考|决定)/.test(clientText)) updates.urgency = '近期要报名';
  if (/(?:预算.{0,10}(?:紧|有限|敏感|不高)|费用.{0,10}(?:贵|高|不高)|价格.{0,10}(?:贵|高|不高))/.test(clientText)) updates.budget = '预算敏感';
  const signalConcernMap = { '费用顾虑': '预算问题', '时间顾虑': '担心没时间', '考试焦虑': '担心考试', '信任核验': '机构资质', '用途咨询': '学历用途' };
  updates.concerns = transcriptSignals(clientText).map((signal) => signalConcernMap[signal]).filter(Boolean);
  return normalizeProfileUpdates(updates);
}

function demoCallCoach(transcript, profile = lastProfile) {
  const safe = cleanText(transcript, 8000);
  const signals = transcriptSignals(safe);
  const profileUpdates = localProfileUpdatesFromTranscript(transcript);
  const lastPart = safe.slice(-450);
  const has = (label) => signals.includes(label);
  let stage = '需求澄清';
  let nextLine = '“我先不急着给您定哪一种方式，想确认下您现在最高学历、准备在哪个省份报，以及您最在意的是时间、考试还是费用？”';
  let nextQuestion = '“您这次提升学历，最想解决的具体用途是什么？”';
  let risk = '资格、费用、流程、毕业和学历用途均需查已审核资料或转人工确认。';
  let nextAction = '补齐学历、地区、用途三项基础信息，再核验当期资料。';
  if (has('高风险表述')) {
    stage = '高风险澄清';
    nextLine = '“这类承诺我不能给您。不同项目都有明确的学习、考试和审核要求，我们可以把真实流程、需要准备的事项和官方依据给您核对清楚。”';
    nextQuestion = '“您最担心的是时间安排、考试环节，还是费用是否透明？我按这一项给您说明。”';
    risk = '不要附和“包过、保录取、免考、内部名额、快速拿证、代考”等说法；记录后按合规流程转人工。';
    nextAction = '标记风险诉求，停止任何结果承诺，转合规负责人确认。';
  } else if (has('费用顾虑')) {
    stage = '费用核验';
    nextLine = '“我理解您想先把钱花明白。费用不能只报一个总数，我会把官方报名/考试费用、院校收费（如有）和服务项目分开核对后再说明。”';
    nextQuestion = '“您更在意总预算，还是希望先看每一项费用和退款规则？”';
    risk = '不可在未核验当前价格表和退款规则前报价或承诺优惠。';
    nextAction = '核验适用地区、项目与当期费用明细后再回访。';
  } else if (has('时间顾虑')) {
    stage = '学习节奏';
    nextLine = '“您担心时间很正常。我们先把您一周能稳定安排的时间讲清楚，再结合真实的学习和考试要求，看哪种节奏更能坚持。”';
    nextQuestion = '“您通常哪几天、每周大概能稳定留出多少时间？”';
    risk = '不要说“不用上课/不用学习”；应如实说明需核验的学习和考试要求。';
    nextAction = '记录可投入时间，按当期要求筛选可持续的方案。';
  } else if (has('考试焦虑')) {
    stage = '考试顾虑';
    nextLine = '“这个担心很常见，我不先给您承诺通过结果。先看您的基础、可投入时间和当期要求，再把需要准备的环节逐项说清楚。”';
    nextQuestion = '“您最担心的是哪一类课程，还是已经很久没有参加过考试？”';
    risk = '不得承诺通过率、包过或用模糊“很简单”弱化真实要求。';
    nextAction = '补充学习基础和时间信息，再核验具体项目要求。';
  } else if (has('信任核验')) {
    stage = '建立信任';
    nextLine = '“您核验机构和项目很有必要。我们可以把服务主体、可核验的官方资料、收费明细和退款规则逐项给您看，涉及院校项目以官方通知为准。”';
    nextQuestion = '“您希望我先发机构服务和收费说明，还是先核验您所在省的当期项目？”';
    risk = '不要夸大与高校、考试机构的关系，也不要伪造或暗示特殊渠道。';
    nextAction = '发送已审核的机构资料和适用项目官方来源，保留版本。';
  } else if (has('用途咨询')) {
    stage = '用途核验';
    nextLine = '“用途要看您具体要办什么，以及相关单位当年的要求，不能一概而论。您把具体场景告诉我，我按对应公告和项目要求帮您核验。”';
    nextQuestion = '“您是想用于哪一类具体场景？是否有目标单位或当年的公告可以一起看？”';
    risk = '不可笼统承诺“全国通用、一定可考公/考编/落户”。';
    nextAction = '记录具体用途，核验目标单位/地区当期规则。';
  } else if (has('正在比较')) {
    stage = '方案比较';
    nextLine = '“多比较是对的。我们可以不急着选，先用同一套标准核对：资格、学习/考试要求、费用明细、退款规则和官方依据。”';
    nextQuestion = '“您正在比较时最看重哪一项：学习安排、费用透明，还是具体用途？”';
    risk = '不要贬低竞品或虚构政策、优惠和师资；只讲可核验事实。';
    nextAction = '按同一口径制作可核验的比较清单。';
  } else if (has('报名时点')) {
    stage = '报名时点核验';
    nextLine = '“报名时间必须以您所在地区当期官方通知为准。我先确认地区和目标，再查已审核资料，避免给您错误的截止信息。”';
    nextQuestion = '“您目前在什么省市，想报哪个层次或专业？”';
    risk = '不可制造“最后名额/马上截止”等虚假紧迫感。';
    nextAction = '核验地区和当期公告后，给出带来源与日期的回复。';
  } else if (safe.length > 100) {
    stage = '需求探索';
    nextLine = '“我先把您的实际情况摸清楚，方案才不会跑偏。您目前的学历、所在省份和这次主要用途分别是什么？”';
    nextQuestion = '“除了学历层次，您最希望改善的是职业发展、岗位要求，还是其他具体事情？”';
  }
  const signalsOut = signals.length ? signals : ['需求待补充'];
  const profileHint = profile?.major ? `已记录意向专业：${profile.major}。` : '尚未确认意向专业。';
  return {
    stage,
    signals: signalsOut,
    nextLine,
    nextQuestion,
    risk,
    summarySnippet: `${stage}：${signalsOut.join('、')}。${profileHint} 最近对话关注点已记录，具体事项仍需核验。`,
    nextAction,
    profileUpdates,
    latest: lastPart
  };
}

function normalizeCallCoach(value, transcript) {
  const fallback = demoCallCoach(transcript);
  if (!value || typeof value !== 'object') return fallback;
  return {
    stage: cleanText(value.stage, 60) || fallback.stage,
    signals: asArray(value.signals, 5).length ? asArray(value.signals, 5) : fallback.signals,
    nextLine: cleanText(value.nextLine, 700) || fallback.nextLine,
    nextQuestion: cleanText(value.nextQuestion, 500) || fallback.nextQuestion,
    risk: cleanText(value.risk, 500) || fallback.risk,
    summarySnippet: cleanText(value.summarySnippet, 600) || fallback.summarySnippet,
    nextAction: cleanText(value.nextAction, 300) || fallback.nextAction,
    profileUpdates: normalizeProfileUpdates(value.profileUpdates),
    latest: fallback.latest
  };
}

function renderCallCoach(coach, source = '本地即时提示') {
  els.callSignals.replaceChildren();
  coach.signals.forEach((signal) => {
    const risk = /风险|高风险/.test(signal);
    els.callSignals.append(make('span', `signal ${risk ? 'warning' : ''}`, signal));
  });
  const adviceLabel = els.callAdvice.querySelector('.coach-label');
  const adviceText = els.callAdvice.querySelector('p');
  if (adviceLabel) adviceLabel.textContent = `下一句建议 · ${coach.stage}`;
  if (adviceText) adviceText.textContent = coach.nextLine;
  const questionLabel = els.callQuestionCard.querySelector('.coach-label');
  const questionText = els.callQuestionCard.querySelector('p');
  if (questionLabel) questionLabel.textContent = '现在只差问';
  if (questionText) questionText.textContent = coach.nextQuestion;
  els.callRisk.replaceChildren(make('b', '', '先核验 / 不要承诺：'), document.createTextNode(coach.risk));
  if (els.callStageDisplay) els.callStageDisplay.textContent = coach.stage;
  if (!autoCallAnalyzeInFlight) {
    els.analyzeCall.textContent = source.includes('AI') ? '已 AI 分析' : '立即分析';
  }
}

function scheduleCallAnalysis() {
  window.clearTimeout(callAnalyzeTimeout);
  callAnalyzeTimeout = window.setTimeout(() => {
    const text = els.transcript.value.trim();
    if (!text) return;
    lastCallCoach = demoCallCoach(text);
    applyProfileUpdates(lastCallCoach.profileUpdates);
    renderCallCoach(lastCallCoach);
  }, 700);
}

function hasMeaningfulNewTranscript(text) {
  if (!lastAutoAnalyzedTranscript) return text.length >= AUTO_CALL_ANALYSIS_MIN_NEW_CHARS;
  const delta = text.startsWith(lastAutoAnalyzedTranscript)
    ? text.slice(lastAutoAnalyzedTranscript.length).trim()
    : text;
  if (delta.length >= AUTO_CALL_ANALYSIS_MIN_NEW_CHARS) return true;
  const previousSignals = new Set(transcriptSignals(lastAutoAnalyzedTranscript));
  return transcriptSignals(text).some((signal) => !previousSignals.has(signal));
}

function scheduleAutoCallAnalysis() {
  cancelAutoCallAnalysis();
  const text = els.transcript.value.trim();
  if (!autoCallAnalysisIsReady() || !text || text === lastAutoAnalyzedTranscript) return;
  if (!hasMeaningfulNewTranscript(text)) {
    setAutoCallAnalysisStatus('已收到新转写，继续补充一句后会自动更新 AI 话术。', 'ready');
    return;
  }
  const remainingInterval = Math.max(0, AUTO_CALL_ANALYSIS_MIN_INTERVAL_MS - (Date.now() - lastAutoAnalyzedAt));
  const delay = Math.max(AUTO_CALL_ANALYSIS_DELAY_MS, remainingInterval);
  setAutoCallAnalysisStatus(`已收到新转写，停顿后约 ${Math.ceil(delay / 1000)} 秒自动更新话术。`, 'ready');
  autoCallAnalyzeTimeout = window.setTimeout(() => { void runAutoCallAnalysis(); }, delay);
}

function handleTranscriptChange() {
  transcriptRevision += 1;
  autoCallAnalysisPaused = false;
  scheduleCallAnalysis();
  scheduleAutoCallAnalysis();
}

async function callCoachWithAI(transcript) {
  const profile = lastProfile || profileFromForm();
  if (hasBrowserMiniMaxConnection()) return callCoachWithBrowserMiniMax(profile, transcript);
  const response = await fetch('/api/call-coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: modelProfile(profile), transcript: cleanText(transcript, 8000) })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '通话分析服务暂时不可用');
  return payload.result;
}

async function runAutoCallAnalysis() {
  autoCallAnalyzeTimeout = null;
  const transcript = els.transcript.value.trim();
  if (!autoCallAnalysisIsReady() || !transcript || transcript === lastAutoAnalyzedTranscript || !hasMeaningfulNewTranscript(transcript)) return;
  if (autoCallAnalyzeInFlight) return;

  const requestRevision = transcriptRevision;
  let resolvedWithAI = false;
  autoCallAnalyzeInFlight = true;
  els.analyzeCall.disabled = true;
  els.analyzeCall.textContent = '自动分析中…';
  setAutoCallAnalysisStatus('正在根据最新客户转写生成下一句建议…', 'busy');
  try {
    const coach = normalizeCallCoach(await callCoachWithAI(transcript), transcript);
    const isLatest = autoCallAnalysisIsReady()
      && requestRevision === transcriptRevision
      && els.transcript.value.trim() === transcript;
    if (!isLatest) return;
    lastCallCoach = coach;
    renderCallCoach(lastCallCoach, 'AI 自动实时分析');
    const updated = applyProfileUpdates(lastCallCoach.profileUpdates);
    lastAutoAnalyzedTranscript = transcript;
    lastAutoAnalyzedAt = Date.now();
    resolvedWithAI = true;
    setAutoCallAnalysisStatus(updated.length
      ? `AI 已更新话术，并补充画像：${updated.join('、')}。`
      : 'AI 已根据最新客户发言更新话术。', 'ready');
  } catch {
    const isLatest = autoCallAnalysisIsReady()
      && requestRevision === transcriptRevision
      && els.transcript.value.trim() === transcript;
    if (!isLatest) return;
    lastCallCoach = demoCallCoach(transcript);
    applyProfileUpdates(lastCallCoach.profileUpdates);
    renderCallCoach(lastCallCoach);
    lastAutoAnalyzedTranscript = transcript;
    lastAutoAnalyzedAt = Date.now();
    setAutoCallAnalysisStatus('AI 暂时不可用，当前继续使用本地即时提示。', 'error');
  } finally {
    autoCallAnalyzeInFlight = false;
    els.analyzeCall.disabled = false;
    if (autoCallAnalysisIsReady() && els.transcript.value.trim() !== lastAutoAnalyzedTranscript) {
      scheduleAutoCallAnalysis();
    } else if (autoCallAnalysisIsReady()) {
      els.analyzeCall.textContent = resolvedWithAI ? '自动已更新' : '本地提示';
    } else {
      syncAutoCallAnalysisUI();
    }
  }
}

async function analyzeCurrentCall() {
  const transcript = els.transcript.value.trim();
  if (!transcript) {
    showToast('先粘贴或开始获取通话转写内容。');
    return;
  }
  els.analyzeCall.disabled = true;
  els.analyzeCall.textContent = '分析中…';
  try {
    const usingAI = els.aiToggle.checked && hasAvailableAIService();
    if (usingAI) {
      lastCallCoach = normalizeCallCoach(await callCoachWithAI(transcript), transcript);
      renderCallCoach(lastCallCoach, 'AI 深度分析');
    } else {
      lastCallCoach = demoCallCoach(transcript);
      renderCallCoach(lastCallCoach);
    }
    const updated = applyProfileUpdates(lastCallCoach.profileUpdates);
    if (usingAI && els.autoCallAnalysis?.checked) {
      lastAutoAnalyzedTranscript = transcript;
      lastAutoAnalyzedAt = Date.now();
      setAutoCallAnalysisStatus(updated.length
        ? `已手动 AI 分析，并补充画像：${updated.join('、')}。`
        : '已手动 AI 分析；后续新转写会自动更新。', 'ready');
    }
    if (updated.length) showToast(`已根据通话补充画像：${updated.join('、')}。`);
  } catch (error) {
    lastCallCoach = demoCallCoach(transcript);
    applyProfileUpdates(lastCallCoach.profileUpdates);
    renderCallCoach(lastCallCoach);
    showToast(`${error.message}；已使用本地提示。`);
  } finally {
    els.analyzeCall.disabled = false;
    if (els.analyzeCall.textContent === '分析中…') els.analyzeCall.textContent = '立即分析';
  }
}

async function finishCall() {
  const transcript = els.transcript.value.trim();
  if (!transcript) {
    showToast('没有通话内容可整理。');
    return;
  }
  stopListening();
  autoCallAnalysisPaused = true;
  cancelAutoCallAnalysis({ invalidate: true });
  syncAutoCallAnalysisUI();
  els.finishCall.disabled = true;
  els.finishCall.textContent = '整理中…';
  try {
    if (els.aiToggle.checked && hasAvailableAIService()) {
      lastCallCoach = normalizeCallCoach(await callCoachWithAI(transcript), transcript);
      renderCallCoach(lastCallCoach, 'AI 深度分析');
    } else {
      lastCallCoach = demoCallCoach(transcript);
      renderCallCoach(lastCallCoach);
    }
    const updated = applyProfileUpdates(lastCallCoach.profileUpdates);
    const profile = lastProfile || profileFromForm();
    const duration = els.callDuration.textContent;
    lastCallSummary = [
      '【通话纪要（请人工核对）】',
      `通话时长：${duration}`,
      `学员：${profile.alias || '未命名学员'}`,
      `当前阶段：${lastCallCoach.stage}`,
      `关注信号：${lastCallCoach.signals.join('、')}`,
      `沟通摘要：${lastCallCoach.summarySnippet}`,
      `建议下次动作：${lastCallCoach.nextAction}`,
      '待核验：资格、当期项目/批次、费用及退款、学习/考试要求、用途表述。'
    ].join('\n');
    els.callSummary.textContent = lastCallSummary;
    els.callSummary.hidden = false;
    els.copyCallSummary.disabled = false;
    showToast(updated.length ? `通话纪要已生成；已补充画像：${updated.join('、')}。` : '通话纪要已生成，请确认事实后写入 CRM。');
  } catch (error) {
    lastCallCoach = demoCallCoach(transcript);
    applyProfileUpdates(lastCallCoach.profileUpdates);
    renderCallCoach(lastCallCoach);
    showToast(`${error.message}；已使用本地提示生成纪要。`);
    const profile = lastProfile || profileFromForm();
    lastCallSummary = [
      '【通话纪要（请人工核对）】',
      `通话时长：${els.callDuration.textContent}`,
      `学员：${profile.alias || '未命名学员'}`,
      `当前阶段：${lastCallCoach.stage}`,
      `关注信号：${lastCallCoach.signals.join('、')}`,
      `沟通摘要：${lastCallCoach.summarySnippet}`,
      `建议下次动作：${lastCallCoach.nextAction}`,
      '待核验：资格、当期项目/批次、费用及退款、学习/考试要求、用途表述。'
    ].join('\n');
    els.callSummary.textContent = lastCallSummary;
    els.callSummary.hidden = false;
    els.copyCallSummary.disabled = false;
  } finally {
    els.finishCall.disabled = false;
    els.finishCall.textContent = '生成通话纪要与跟进';
  }
}

function resetCallUI() {
  stopListening();
  cancelAutoCallAnalysis({ invalidate: true });
  autoCallAnalysisPaused = false;
  lastAutoAnalyzedTranscript = '';
  lastAutoAnalyzedAt = 0;
  timerStartedAt = null;
  els.callDuration.textContent = '00:00';
  els.transcript.value = '';
  els.livePartial.textContent = '';
  els.callSummary.hidden = true;
  els.callSummary.textContent = '';
  els.copyCallSummary.disabled = true;
  lastCallCoach = null;
  lastCallSummary = '';
  renderCallCoach({
    stage: '等待通话内容', signals: ['等待通话内容'],
    nextLine: '先让学员多说一点：他的目标、目前学历、所在省份，以及最担心的事情。不要在资料未核验前谈具体承诺。',
    nextQuestion: '“为了不把方案给您讲错，我先确认一下您现在最高学历和所在省份，可以吗？”',
    risk: '资格、费用、流程、毕业和学历用途均需查已审核资料或转人工确认。'
  });
  syncAutoCallAnalysisUI();
}

function handleAutoCallAnalysisToggle() {
  if (!els.autoCallAnalysis) return;
  if (!els.autoCallAnalysis.checked) {
    cancelAutoCallAnalysis({ invalidate: true });
    syncAutoCallAnalysisUI();
    return;
  }
  if (!hasAvailableAIService() || !els.aiToggle.checked) {
    els.autoCallAnalysis.checked = false;
    syncAutoCallAnalysisUI();
    return;
  }
  if (!els.callConsent.checked) {
    els.autoCallAnalysis.checked = false;
    syncAutoCallAnalysisUI();
    showToast('请先确认已完成通话实时转写所需的告知与授权。');
    return;
  }
  autoCallAnalysisPaused = false;
  lastAutoAnalyzedTranscript = '';
  lastAutoAnalyzedAt = 0;
  syncAutoCallAnalysisUI();
  scheduleAutoCallAnalysis();
}

function attachEvents() {
  [
    [els.selfDiscipline, els.disciplineValue],
    [els.examAnxiety, els.anxietyValue]
  ].forEach(([input, target]) => {
    setRangeDisplay(input, target);
    input.addEventListener('input', () => setRangeDisplay(input, target));
  });
  els.form.addEventListener('submit', handleGenerate);
  els.form.addEventListener('input', (event) => {
    markProfileFieldAsManual(event);
    updateCallProfileSummary();
  });
  els.form.addEventListener('change', (event) => {
    markProfileFieldAsManual(event);
    updateCallProfileSummary();
  });
  els.form.addEventListener('reset', () => {
    window.setTimeout(() => {
      profileTouchedFields.clear();
      setRangeDisplay(els.selfDiscipline, els.disciplineValue);
      setRangeDisplay(els.examAnxiety, els.anxietyValue);
      lastProfile = null;
      lastResult = null;
      updateCallProfileSummary();
      renderEmpty();
    }, 0);
  });
  els.copyButton.addEventListener('click', () => { if (lastResult) copyText(resultToText(lastResult), '咨询建议已复制。'); });
  els.saveButton.addEventListener('click', saveCurrentLead);
  els.exportButton.addEventListener('click', exportLeads);
  els.clearLeadsButton.addEventListener('click', clearLeads);
  els.startListening.addEventListener('click', startListening);
  els.stopListening.addEventListener('click', stopListening);
  els.transcript.addEventListener('input', handleTranscriptChange);
  els.autoCallAnalysis?.addEventListener('change', handleAutoCallAnalysisToggle);
  els.aiToggle.addEventListener('change', () => {
    if (!els.aiToggle.checked && els.autoCallAnalysis?.checked) {
      els.autoCallAnalysis.checked = false;
      cancelAutoCallAnalysis({ invalidate: true });
    }
    syncAutoCallAnalysisUI();
    if (autoCallAnalysisIsReady()) scheduleAutoCallAnalysis();
  });
  els.callConsent.addEventListener('change', () => {
    if (!els.callConsent.checked && els.autoCallAnalysis?.checked) {
      els.autoCallAnalysis.checked = false;
      cancelAutoCallAnalysis({ invalidate: true });
      syncAutoCallAnalysisUI();
      showToast('已关闭自动实时 AI 分析。');
    }
  });
  els.analyzeCall.addEventListener('click', analyzeCurrentCall);
  els.copyNextLine.addEventListener('click', () => {
    const nextLine = lastCallCoach?.nextLine || els.callAdvice.querySelector('p')?.textContent || '';
    if (nextLine) copyText(nextLine, '下一句建议已复制。');
  });
  els.finishCall.addEventListener('click', finishCall);
  els.copyCallSummary.addEventListener('click', () => { if (lastCallSummary) copyText(lastCallSummary, '通话纪要已复制。'); });
  els.connectKeyButton?.addEventListener('click', openKeyDialog);
  els.closeKeyDialogButton?.addEventListener('click', closeKeyDialog);
  els.keyForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void connectBrowserMiniMax();
  });
  els.clearKeyButton?.addEventListener('click', () => clearBrowserMiniMaxConnection());
  els.focusModeToggle.addEventListener('click', () => setFocusMode(!document.body.classList.contains('focus-mode')));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('focus-mode')) setFocusMode(false);
  });
  window.addEventListener('pagehide', () => {
    stopListening();
    cancelAutoCallAnalysis({ invalidate: true });
    clearBrowserMiniMaxConnection({ quiet: true });
  });
}

async function init() {
  attachEvents();
  if (!speechRecognitionSupported()) {
    els.startListening.disabled = true;
    els.speechState.textContent = '浏览器不支持麦克风转写，可粘贴转写内容';
  }
  loadLeads();
  resetCallUI();
  updateCallProfileSummary();
  await Promise.all([fetchServiceHealth(), fetchKnowledgeStatus()]);
}

init();

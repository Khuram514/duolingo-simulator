import crypto from 'node:crypto';

export const IMAGE_CATALOG = [
  {
    id: 'coastal-village',
    url: '/images/photos/coastal-village.webp',
    alt: 'A small coastal village built on rocky land beside calm water, with a white motorboat in the foreground.',
    credit: 'galore / Unsplash — reference crop',
    referenceDescription: 'A quiet coastal village sits on rugged rocks beside still water. Several light-colored houses with dark and red roofs stand above the shoreline. A small white motorboat floats near the center, and the buildings are reflected in the water under a pale blue sky.',
    keyDetails: ['coastal village', 'rocky shoreline', 'small houses', 'white motorboat', 'calm water', 'reflections', 'quiet atmosphere']
  },
  {
    id: 'shuttle-launch',
    url: '/images/photos/shuttle-launch.webp',
    alt: 'A space shuttle launching beside a tower as flames and thick smoke spread across the launch pad.',
    credit: 'Robert Sullivan / Flickr — reference crop',
    referenceDescription: 'A space shuttle is lifting off beside a metal launch tower. Bright orange flames are visible underneath the vehicle, while large clouds of white and gray smoke fill the lower part of the scene. The sky is dark blue and the launch appears powerful and dramatic.',
    keyDetails: ['space shuttle', 'launch tower', 'bright flames', 'thick smoke', 'dark blue sky', 'liftoff', 'dramatic atmosphere']
  },
  {
    id: 'astronaut-portrait',
    url: '/images/photos/astronaut-portrait.webp',
    alt: 'A smiling astronaut wearing an orange flight suit and holding a helmet in front of flags and spacecraft imagery.',
    credit: 'NASA public-domain sample',
    referenceDescription: 'A smiling astronaut poses for a formal portrait in an orange flight suit. The person holds a large helmet, and mission patches are visible on the suit. A national flag and spacecraft imagery appear in the background.',
    keyDetails: ['astronaut', 'orange flight suit', 'helmet', 'mission patches', 'smiling portrait', 'flag', 'spacecraft background']
  },
  {
    id: 'rocket-pad',
    url: '/images/photos/rocket-pad.webp',
    alt: 'A tall white rocket standing upright on a launch pad at dusk between several support towers.',
    credit: 'SpaceX public-domain sample',
    referenceDescription: 'A tall white rocket stands upright on a launch pad at dusk. Several dark support towers frame the rocket, and bright lights illuminate the base. The sky is deep blue, creating a calm but anticipatory atmosphere before launch.',
    keyDetails: ['white rocket', 'launch pad', 'support towers', 'bright base lights', 'dusk sky', 'vertical composition']
  },
  {
    id: 'cafe-coffee',
    url: '/images/photos/cafe-coffee.webp',
    alt: 'A cup of coffee on a red saucer with a spoon, placed on a wooden table.',
    credit: 'Rachel Michetti / CC0 sample',
    referenceDescription: 'A ceramic cup containing coffee rests on a red saucer on a wooden table. A small metal spoon lies beside the cup. Warm colors and close framing create a relaxed café atmosphere.',
    keyDetails: ['coffee cup', 'red saucer', 'metal spoon', 'wooden table', 'warm colors', 'close-up']
  },
  {
    id: 'field-photographer',
    url: '/images/photos/field-photographer.webp',
    alt: 'A person in a dark coat looking through a camera mounted on a tripod in an open outdoor area.',
    credit: 'Lav Varshney / CC0 sample',
    referenceDescription: 'A person wearing a dark coat leans toward a camera mounted on a tripod. The scene is outdoors in an open field or waterfront area, with distant buildings and structures in the background. The black-and-white image suggests documentary or professional photography.',
    keyDetails: ['photographer', 'camera', 'tripod', 'dark coat', 'outdoor field', 'distant buildings', 'black and white']
  },
  {
    id: 'cat-closeup',
    url: '/images/photos/cat-closeup.webp',
    alt: 'A close-up portrait of a brown tabby cat with large green eyes.',
    credit: 'Stefan van der Walt / CC0 sample',
    referenceDescription: 'A brown tabby cat is shown in close-up. Its large green eyes, striped fur, whiskers, and pink nose are clearly visible. The shallow background keeps attention on the animal’s alert expression.',
    keyDetails: ['tabby cat', 'green eyes', 'striped fur', 'whiskers', 'pink nose', 'close-up portrait']
  },
  {
    id: 'deep-space',
    url: '/images/photos/deep-space.webp',
    alt: 'A dense deep-space field filled with many distant galaxies and stars against a black background.',
    credit: 'NASA public-domain sample',
    referenceDescription: 'A deep-space image shows a dense field of distant galaxies and bright stars against a black background. The objects vary in size, shape, and color, producing a rich scientific view of the universe.',
    keyDetails: ['deep space', 'distant galaxies', 'bright stars', 'black background', 'many colors', 'scientific image']
  },
  {
    id: 'motion-clock',
    url: '/images/photos/motion-clock.webp',
    alt: 'A blurred circular clock-like object moving against a plain gray background.',
    credit: 'Stefan van der Walt / public-domain sample',
    referenceDescription: 'A circular clock-like object appears blurred against a plain gray background. The motion blur suggests rapid movement or a long-exposure photograph. The minimalist composition emphasizes motion and shape rather than detail.',
    keyDetails: ['circular object', 'motion blur', 'gray background', 'minimal composition', 'movement', 'long exposure effect']
  }
];

const READ_SELECT = [
  ['abundant', true, 1, 'Existing adjective meaning plentiful.'],
  ['definately', false, 1, 'The correct spelling is definitely.'],
  ['resilient', true, 2, 'Existing adjective meaning able to recover.'],
  ['seperate', false, 1, 'The correct spelling is separate.'],
  ['meticulous', true, 3, 'Existing adjective meaning very careful and precise.'],
  ['accomodate', false, 2, 'The correct spelling is accommodate.'],
  ['corroborate', true, 4, 'Existing verb meaning confirm with evidence.'],
  ['enviroment', false, 1, 'The correct spelling is environment.'],
  ['ubiquitous', true, 4, 'Existing adjective meaning present everywhere.'],
  ['benificial', false, 2, 'The correct spelling is beneficial.'],
  ['pragmatic', true, 3, 'Existing adjective meaning practical and realistic.'],
  ['persistant', false, 2, 'The correct spelling is persistent.'],
  ['ambivalent', true, 4, 'Existing adjective meaning having mixed feelings.'],
  ['recomendation', false, 2, 'The correct spelling is recommendation.'],
  ['exacerbate', true, 5, 'Existing verb meaning make a problem worse.'],
  ['responsibile', false, 2, 'The correct spelling is responsible.'],
  ['conscientious', true, 4, 'Existing adjective meaning careful and responsible.'],
  ['perserverance', false, 3, 'The correct spelling is perseverance.']
].map(([word, isReal, difficulty, explanation], index) => ({
  id: `rs-${index + 1}`,
  type: 'read-select',
  word,
  isReal,
  difficulty,
  explanation
}));

const FILL_BLANKS = [
  {
    id: 'fb-1', type: 'fill-blank', difficulty: 2,
    sentenceBefore: 'The findings were remarkably ', prefix: 'consis', answer: 'consistent', sentenceAfter: ' across all three experiments.',
    explanation: '“Remarkably” modifies the adjective “consistent.”'
  },
  {
    id: 'fb-2', type: 'fill-blank', difficulty: 2,
    sentenceBefore: 'The university ', prefix: 'implem', answer: 'implemented', sentenceAfter: ' a new attendance policy last year.',
    explanation: 'The past-time marker “last year” requires the past tense “implemented.”'
  },
  {
    id: 'fb-3', type: 'fill-blank', difficulty: 3,
    sentenceBefore: 'Regular feedback can ', prefix: 'substan', answer: 'substantially', sentenceAfter: ' improve a learner’s performance.',
    explanation: 'An adverb is required to modify “improve.”'
  },
  {
    id: 'fb-4', type: 'fill-blank', difficulty: 4,
    sentenceBefore: 'Reliable public transport is ', prefix: 'indispen', answer: 'indispensable', sentenceAfter: ' in a densely populated city.',
    explanation: '“Indispensable” means absolutely necessary.'
  },
  {
    id: 'fb-5', type: 'fill-blank', difficulty: 4,
    sentenceBefore: 'Because the instructions were ', prefix: 'ambig', answer: 'ambiguous', sentenceAfter: ', several participants misunderstood the task.',
    explanation: 'The adjective “ambiguous” describes unclear instructions.'
  },
  {
    id: 'fb-6', type: 'fill-blank', difficulty: 3,
    sentenceBefore: 'Researchers from several institutions agreed to ', prefix: 'collab', answer: 'collaborate', sentenceAfter: ' on the project.',
    explanation: 'After “to,” the base verb “collaborate” is required.'
  },
  {
    id: 'fb-7', type: 'fill-blank', difficulty: 4,
    sentenceBefore: 'Remote work has become increasingly ', prefix: 'preval', answer: 'prevalent', sentenceAfter: ' in technology companies.',
    explanation: '“Prevalent” means widespread or common.'
  },
  {
    id: 'fb-8', type: 'fill-blank', difficulty: 3,
    sentenceBefore: 'The building gradually ', prefix: 'deteri', answer: 'deteriorated', sentenceAfter: ' after years of neglect.',
    explanation: 'The sentence describes a completed decline in the past.'
  },
  {
    id: 'fb-9', type: 'fill-blank', difficulty: 5,
    sentenceBefore: 'A ', prefix: 'conscien', answer: 'conscientious', sentenceAfter: ' editor checks both factual accuracy and clarity.',
    explanation: 'The adjective “conscientious” means diligent and responsible.'
  }
];

const READ_COMPLETE = [
  {
    id: 'rc-1', type: 'read-complete', difficulty: 2, title: 'Why Urban Trees Matter',
    segments: [
      { text: 'Trees make cities more comfortable and ' }, { prefix: 'liv', answer: 'livable' },
      { text: '. Their leaves provide shade, lower surface temperatures, and improve air ' }, { prefix: 'qual', answer: 'quality' },
      { text: '. They can also reduce noise and absorb some rainwater before it enters drainage ' }, { prefix: 'sys', answer: 'systems' },
      { text: '. However, planting a tree is only the first step. Young trees require regular watering and ' }, { prefix: 'care', answer: 'careful' },
      { text: ' maintenance. When city planners choose suitable species and protect enough soil around the roots, urban trees are more likely to remain ' }, { prefix: 'heal', answer: 'healthy' },
      { text: ' for many decades.' }
    ]
  },
  {
    id: 'rc-2', type: 'read-complete', difficulty: 3, title: 'The Value of Productive Struggle',
    segments: [
      { text: 'Learning often feels most satisfying when an answer becomes clear immediately, yet a brief period of ' }, { prefix: 'strug', answer: 'struggle' },
      { text: ' can strengthen memory. When students attempt a difficult problem before seeing the solution, they activate prior ' }, { prefix: 'know', answer: 'knowledge' },
      { text: ' and notice gaps in their understanding. This effort should not become overwhelming; guidance remains ' }, { prefix: 'essen', answer: 'essential' },
      { text: '. A well-designed lesson therefore balances challenge with support. The goal is not to make learning ' }, { prefix: 'frus', answer: 'frustrating' },
      { text: ', but to encourage learners to think actively and explain why a method ' }, { prefix: 'work', answer: 'works' },
      { text: '.' }
    ]
  },
  {
    id: 'rc-3', type: 'read-complete', difficulty: 3, title: 'Community Science',
    segments: [
      { text: 'Professional researchers increasingly invite members of the public to help collect scientific ' }, { prefix: 'data', answer: 'data' },
      { text: '. Volunteers may photograph insects, measure rainfall, or record changes in local bird ' }, { prefix: 'popu', answer: 'populations' },
      { text: '. Because thousands of people can contribute observations across wide areas, these projects often produce information that would otherwise be too ' }, { prefix: 'expen', answer: 'expensive' },
      { text: ' to gather. Researchers must still check the records carefully and provide clear ' }, { prefix: 'instr', answer: 'instructions' },
      { text: '. When managed responsibly, community science can support research while increasing public ' }, { prefix: 'engage', answer: 'engagement' },
      { text: ' with environmental issues.' }
    ]
  },
  {
    id: 'rc-4', type: 'read-complete', difficulty: 4, title: 'The Limits of Multitasking',
    segments: [
      { text: 'People often describe themselves as effective multitaskers, but the brain usually switches rapidly between tasks rather than processing both at the same ' }, { prefix: 'mo', answer: 'moment' },
      { text: '. Each switch carries a small mental cost. These costs may seem ' }, { prefix: 'insig', answer: 'insignificant' },
      { text: ', yet they accumulate when interruptions are frequent. Complex work therefore takes longer and may contain more ' }, { prefix: 'er', answer: 'errors' },
      { text: '. Reducing notifications and grouping similar activities can protect ' }, { prefix: 'atten', answer: 'attention' },
      { text: '. The most useful strategy is not always to work faster, but to create conditions that allow sustained ' }, { prefix: 'concen', answer: 'concentration' },
      { text: '.' }
    ]
  },
  {
    id: 'rc-5', type: 'read-complete', difficulty: 4, title: 'Restoring Old Buildings',
    segments: [
      { text: 'Restoring a historic building requires more than making it look new. Architects first investigate which materials and techniques were ' }, { prefix: 'orig', answer: 'originally' },
      { text: ' used. They then decide which features can be repaired and which must be ' }, { prefix: 'repl', answer: 'replaced' },
      { text: '. Modern safety standards may require stronger structures, improved fire protection, or greater ' }, { prefix: 'access', answer: 'accessibility' },
      { text: '. The challenge is to introduce these changes without destroying the building’s character. Successful restoration therefore depends on careful research, skilled ' }, { prefix: 'crafts', answer: 'craftsmanship' },
      { text: ', and a willingness to balance preservation with practical ' }, { prefix: 'need', answer: 'needs' },
      { text: '.' }
    ]
  },
  {
    id: 'rc-6', type: 'read-complete', difficulty: 5, title: 'Why Forecasts Change',
    segments: [
      { text: 'A forecast is not a fixed promise but an estimate based on the best information currently ' }, { prefix: 'avail', answer: 'available' },
      { text: '. Weather models, for example, divide the atmosphere into a vast number of cells and calculate how conditions may ' }, { prefix: 'evo', answer: 'evolve' },
      { text: '. Small measurement errors can grow over time, which makes long-range predictions less ' }, { prefix: 'prec', answer: 'precise' },
      { text: '. As new observations arrive, scientists update the model and the forecast may change. This revision is not evidence of failure; it reflects a more ' }, { prefix: 'accu', answer: 'accurate' },
      { text: ' understanding of an inherently ' }, { prefix: 'dyna', answer: 'dynamic' },
      { text: ' system.' }
    ]
  }
];

const LISTEN_TYPE = [
  ['Please submit the revised report before the meeting begins.', 1],
  ['The museum remains closed on Mondays during the winter.', 1],
  ['Several students volunteered to organize the community event.', 2],
  ['Although the route was longer, it offered a much safer journey.', 2],
  ['The committee postponed its decision until additional evidence became available.', 3],
  ['Researchers should distinguish correlation from causation when interpreting these results.', 4],
  ['A convincing argument acknowledges reasonable objections before presenting its conclusion.', 4],
  ['The unexpected delay was inconvenient but did not significantly affect the final outcome.', 3],
  ['Technological innovation can create opportunities while simultaneously introducing complex ethical questions.', 5]
].map(([text, difficulty], index) => ({
  id: `lt-${index + 1}`,
  type: 'listen-type',
  text,
  difficulty
}));

const INTERACTIVE_READING = [
  {
    id: 'ir-1',
    type: 'interactive-reading',
    durationSec: 420,
    difficulty: 3,
    title: 'Cooling Cities with Green Roofs',
    passage: `Cities are often warmer than nearby rural areas because concrete and asphalt absorb heat during the day and release it slowly at night. Green roofs—rooftops partly or completely covered with plants—can reduce this effect. The soil and vegetation shade the roof surface, while water evaporating from leaves cools the surrounding air. Green roofs can also slow stormwater runoff and provide habitat for insects and birds.\n\nHowever, they are not suitable for every building. A roof must be strong enough to support the additional weight, and the plants need maintenance, especially during dry weather. Installation can be expensive, although lower energy costs and longer roof life may offset part of the initial investment. For this reason, many city governments provide grants or planning incentives to encourage appropriate projects.`,
    completeSentences: [
      { id: 'ir1-cs1', before: 'Concrete and asphalt ', after: ' heat during the day.', options: ['absorb', 'divide', 'predict', 'borrow'], answer: 'absorb' },
      { id: 'ir1-cs2', before: 'Water evaporating from leaves ', after: ' the surrounding air.', options: ['cools', 'raises', 'hides', 'measures'], answer: 'cools' },
      { id: 'ir1-cs3', before: 'Green roofs can slow stormwater ', after: '.', options: ['runoff', 'sunlight', 'traffic', 'noise'], answer: 'runoff' },
      { id: 'ir1-cs4', before: 'The roof must support the additional ', after: '.', options: ['weight', 'colour', 'distance', 'speed'], answer: 'weight' },
      { id: 'ir1-cs5', before: 'Some governments offer incentives to ', after: ' suitable projects.', options: ['encourage', 'prohibit', 'replace', 'delay'], answer: 'encourage' }
    ],
    completePassage: {
      id: 'ir1-cp',
      before: 'Installation can be expensive, although lower energy costs and longer roof life may offset part of the initial investment.',
      after: 'For this reason, many city governments provide grants or planning incentives to encourage appropriate projects.',
      options: [
        'Therefore, every existing roof should immediately be covered with plants.',
        'The financial value of a green roof depends on the building, climate, and design.',
        'Most insects are unable to live above the first floor of a building.',
        'Traditional roofs never require maintenance once they are installed.'
      ],
      answerIndex: 1
    },
    highlight: [
      {
        id: 'ir1-h1',
        question: 'Why are cities often warmer than nearby rural areas?',
        acceptedAnswers: ['because concrete and asphalt absorb heat during the day and release it slowly at night', 'concrete and asphalt absorb heat during the day and release it slowly at night']
      },
      {
        id: 'ir1-h2',
        question: 'What must be checked before a green roof is installed?',
        acceptedAnswers: ['a roof must be strong enough to support the additional weight', 'the roof must be strong enough to support the additional weight']
      }
    ],
    identifyIdea: {
      id: 'ir1-idea',
      options: [
        'Green roofs offer several environmental benefits, but their suitability and cost must be considered.',
        'Rural buildings are always cooler because they are constructed from wood.',
        'City governments should legally require identical roofs on every building.',
        'Green roofs are mainly decorative and have little practical value.'
      ],
      answerIndex: 0
    },
    titleQuestion: {
      id: 'ir1-title',
      options: ['The History of Concrete', 'Green Roofs: Benefits and Practical Limits', 'Why Birds Avoid Cities', 'A Guide to Indoor Gardening'],
      answerIndex: 1
    }
  },
  {
    id: 'ir-2',
    type: 'interactive-reading',
    durationSec: 480,
    difficulty: 4,
    title: 'How Sleep Supports Learning',
    passage: `Sleep is sometimes treated as time taken away from study, yet research suggests that it is an essential part of learning. While a person sleeps, the brain does not simply become inactive. It reorganizes recently acquired information, strengthens useful connections, and may integrate new knowledge with older memories. As a result, material studied before adequate sleep is often recalled more accurately than material followed by a night of severe sleep loss.\n\nThe timing of study also matters. Reviewing information shortly before sleep may help, but only when the learner has already tried to understand it. Sleep cannot replace attentive practice or repair material that was never learned. In addition, regular sleep is generally more useful than one unusually long night immediately before an examination. Students who repeatedly sacrifice sleep may gain extra study hours, but declining concentration and judgment can make those hours less productive.`,
    completeSentences: [
      { id: 'ir2-cs1', before: 'During sleep, the brain ', after: ' recently acquired information.', options: ['reorganizes', 'deletes', 'ignores', 'publishes'], answer: 'reorganizes' },
      { id: 'ir2-cs2', before: 'Adequate sleep can improve the ', after: ' of studied material.', options: ['recall', 'price', 'appearance', 'volume'], answer: 'recall' },
      { id: 'ir2-cs3', before: 'Sleep cannot ', after: ' attentive practice.', options: ['replace', 'announce', 'measure', 'prevent'], answer: 'replace' },
      { id: 'ir2-cs4', before: 'Regular sleep is usually more ', after: ' than one unusually long night.', options: ['useful', 'expensive', 'formal', 'visible'], answer: 'useful' },
      { id: 'ir2-cs5', before: 'Sleep loss can reduce concentration and ', after: '.', options: ['judgment', 'temperature', 'transport', 'height'], answer: 'judgment' }
    ],
    completePassage: {
      id: 'ir2-cp',
      before: 'Reviewing information shortly before sleep may help, but only when the learner has already tried to understand it.',
      after: 'In addition, regular sleep is generally more useful than one unusually long night immediately before an examination.',
      options: [
        'Sleep cannot replace attentive practice or repair material that was never learned.',
        'Every student should study only during the final hour of the day.',
        'Dreams provide exact answers to difficult examination questions.',
        'People remember all information equally well regardless of attention.'
      ],
      answerIndex: 0
    },
    highlight: [
      {
        id: 'ir2-h1',
        question: 'What does the brain do with recently acquired information during sleep?',
        acceptedAnswers: ['it reorganizes recently acquired information, strengthens useful connections, and may integrate new knowledge with older memories', 'reorganizes recently acquired information, strengthens useful connections, and may integrate new knowledge with older memories']
      },
      {
        id: 'ir2-h2',
        question: 'Why may extra late-night study hours be less productive?',
        acceptedAnswers: ['declining concentration and judgment can make those hours less productive', 'because declining concentration and judgment can make those hours less productive']
      }
    ],
    identifyIdea: {
      id: 'ir2-idea',
      options: [
        'Sleep supports memory, but it works best alongside attentive study and a regular schedule.',
        'Studying during the night is the only reliable way to remember information.',
        'A single long sleep can fully compensate for weeks of insufficient rest.',
        'The brain becomes completely inactive as soon as a person falls asleep.'
      ],
      answerIndex: 0
    },
    titleQuestion: {
      id: 'ir2-title',
      options: ['Sleep as Part of Effective Learning', 'Why Examinations Should Be Abolished', 'The Meaning of Dreams', 'How to Stay Awake All Night'],
      answerIndex: 0
    }
  }
];

const INTERACTIVE_LISTENING = [
  {
    id: 'il-1',
    type: 'interactive-listening',
    durationSec: 390,
    summaryDurationSec: 75,
    difficulty: 3,
    scenario: {
      text: 'You are a university student speaking with a laboratory coordinator. You missed a chemistry laboratory on Tuesday because you were ill. You have a medical note and want to know how to complete the missed work before the assignment deadline next Monday.',
      blanks: [
        { id: 'il1-lc1', before: 'The student missed a ', after: ' laboratory.', acceptedAnswers: ['chemistry', 'chemistry lab', 'chemistry laboratory'] },
        { id: 'il1-lc2', before: 'The absence happened because the student was ', after: '.', acceptedAnswers: ['ill', 'sick', 'unwell'] },
        { id: 'il1-lc3', before: 'The related assignment is due next ', after: '.', acceptedAnswers: ['Monday'] }
      ]
    },
    turns: [
      {
        id: 'il1-t1', speaker: 'Coordinator', audioText: 'Hello. What can I help you with today?',
        options: ['I would like to ask how I can make up the laboratory I missed.', 'The chemistry building was constructed last year.', 'I have already decided to drop every course.', 'Tuesday is normally followed by Wednesday.'], answerIndex: 0,
        correctResponse: 'I would like to ask how I can make up the laboratory I missed.'
      },
      {
        id: 'il1-t2', speaker: 'Coordinator', audioText: 'I am sorry you were unwell. Do you have documentation for your absence?',
        options: ['No, laboratories never require any equipment.', 'Yes, I have a medical note from the clinic.', 'The assignment contains four pages.', 'I prefer studying in the library.'], answerIndex: 1,
        correctResponse: 'Yes, I have a medical note from the clinic.'
      },
      {
        id: 'il1-t3', speaker: 'Coordinator', audioText: 'Good. There is another laboratory session on Thursday afternoon. Are you available then?',
        options: ['Thursday afternoon would work for me.', 'I was ill on Tuesday morning.', 'The laboratory uses glass containers.', 'Monday is the assignment deadline.'], answerIndex: 0,
        correctResponse: 'Thursday afternoon would work for me.'
      },
      {
        id: 'il1-t4', speaker: 'Coordinator', audioText: 'Please email the medical note today so I can add you to that session.',
        options: ['Could you explain why chemistry has equations?', 'Certainly. I will send it as soon as I leave here.', 'I do not know where the library is.', 'The weather may improve by Thursday.'], answerIndex: 1,
        correctResponse: 'Certainly. I will send it as soon as I leave here.'
      },
      {
        id: 'il1-t5', speaker: 'Coordinator', audioText: 'After the session, submit your report by Monday as originally planned. Is anything else unclear?',
        options: ['No, that answers my questions. Thank you for arranging it.', 'Yes, Tuesday has twenty-four hours.', 'I would like to replace chemistry with history immediately.', 'The report should never contain results.'], answerIndex: 0,
        correctResponse: 'No, that answers my questions. Thank you for arranging it.'
      }
    ],
    summaryMustMention: ['student missed a chemistry laboratory because of illness', 'has a medical note', 'will attend the Thursday afternoon session', 'must email the note', 'report remains due Monday']
  },
  {
    id: 'il-2',
    type: 'interactive-listening',
    durationSec: 390,
    summaryDurationSec: 75,
    difficulty: 4,
    scenario: {
      text: 'You are working on a group presentation and speak with a librarian about reserving a study room. Your group has five members and wants to meet on Friday from three until five in the afternoon. You need a room with a display screen, but the online booking system shows no availability.',
      blanks: [
        { id: 'il2-lc1', before: 'The study group contains ', after: ' members.', acceptedAnswers: ['five', '5'] },
        { id: 'il2-lc2', before: 'They want to meet on ', after: ' afternoon.', acceptedAnswers: ['Friday'] },
        { id: 'il2-lc3', before: 'The room needs to have a display ', after: '.', acceptedAnswers: ['screen', 'monitor'] },
        { id: 'il2-lc4', before: 'The online system currently shows no ', after: '.', acceptedAnswers: ['availability', 'available rooms', 'rooms available'] }
      ]
    },
    turns: [
      {
        id: 'il2-t1', speaker: 'Librarian', audioText: 'The booking system is usually accurate. Did you search all floors?',
        options: ['I only checked the second floor because the filter was selected.', 'Our presentation topic is renewable energy.', 'Five people can read five books.', 'The library closes during the night.'], answerIndex: 0,
        correctResponse: 'I only checked the second floor because the filter was selected.'
      },
      {
        id: 'il2-t2', speaker: 'Librarian', audioText: 'That may explain it. A room on the fourth floor is available from three thirty until five thirty.',
        options: ['The fourth floor has many windows.', 'That time could work, although we would lose the first thirty minutes.', 'We have decided not to give the presentation.', 'A display screen is made of glass.'], answerIndex: 1,
        correctResponse: 'That time could work, although we would lose the first thirty minutes.'
      },
      {
        id: 'il2-t3', speaker: 'Librarian', audioText: 'There is also a media room from three to five, but one member of staff must approve the reservation.',
        options: ['Could you tell me how to request that approval?', 'I prefer the colour of the fourth floor.', 'The presentation is exactly ten minutes long.', 'No one in our group uses the internet.'], answerIndex: 0,
        correctResponse: 'Could you tell me how to request that approval?'
      },
      {
        id: 'il2-t4', speaker: 'Librarian', audioText: 'Complete this short form with the course name and your instructor’s email. Approval usually takes an hour.',
        options: ['I will complete it now and inform the rest of my group.', 'The instructor teaches in another building.', 'An hour contains sixty minutes.', 'The form should remain completely blank.'], answerIndex: 0,
        correctResponse: 'I will complete it now and inform the rest of my group.'
      },
      {
        id: 'il2-t5', speaker: 'Librarian', audioText: 'Once it is approved, the reservation will appear in your online account.',
        options: ['Great. I will check my account later this afternoon.', 'The online account has a blue icon.', 'Friday comes before Saturday.', 'We no longer need any room at all.'], answerIndex: 0,
        correctResponse: 'Great. I will check my account later this afternoon.'
      }
    ],
    summaryMustMention: ['five-person group needs a room Friday from three to five', 'needs a display screen', 'ordinary rooms were unavailable because of a filter', 'media room requires staff approval', 'student will submit a form and check the account later']
  }
];

const WRITING_PROMPTS = [
  {
    prompt: 'Some people learn more effectively alone, while others learn better in groups. Which method do you prefer, and why? Use specific reasons and examples.',
    followup: 'Describe one situation in which the opposite method could be more effective than your preferred method. Explain what would make it useful.'
  },
  {
    prompt: 'Should universities require students to study at least one subject outside their main field? Explain your position with reasons and examples.',
    followup: 'What is one possible disadvantage of your position, and how could a university reduce that disadvantage?'
  },
  {
    prompt: 'Some employers allow staff to choose where they work, while others require everyone to work in an office. Which approach is better for most organizations?',
    followup: 'Identify one type of job for which your preferred approach may not work well, and explain why.'
  }
];

const READ_SPEAK_PROMPTS = [
  'Describe a skill that was difficult for you to learn. Explain why it was difficult, what you did to improve, and how the experience changed you.',
  'Think of a place in your city that visitors should see. Describe the place, explain why it is important, and suggest the best way to experience it.',
  'Describe a time when you had to solve an unexpected problem. Explain the situation, the action you took, and what you learned.'
];

const WRITING_SAMPLE_PROMPTS = [
  'People often disagree about whether technological progress makes life simpler or more complicated. Discuss both sides and explain your own view.',
  'Describe an important decision that should involve public consultation. Explain who should participate and how their opinions should influence the final decision.',
  'What responsibility do individuals have for protecting the environment when governments and large companies create much of the pollution? Support your answer.'
];

const SPEAKING_SAMPLE_PROMPTS = [
  'Describe an experience that changed the way you understand another person or group of people. Explain what happened and why it affected your thinking.',
  'What qualities make someone an effective leader? Give examples and explain whether these qualities can be learned.',
  'Discuss a change you would make to improve education in your community. Explain the problem, your proposed change, and its likely effects.'
];

const INTERACTIVE_SPEAKING = [
  {
    persona: 'Maya, a university classmate',
    context: 'Maya is discussing how students manage demanding schedules.',
    questions: [
      'What is usually the busiest part of your week, and why?',
      'How do you decide which task to complete first when several deadlines are close?',
      'Can you describe a time when your original plan did not work?',
      'What did you do after you realized the plan was failing?',
      'Do digital planning tools help people stay organized, or can they become distracting?',
      'What advice would you give a new student about balancing study and personal life?',
      'Has your approach to time management changed over the years? How?',
      'What is one habit you still want to improve?'
    ]
  },
  {
    persona: 'Daniel, a community volunteer',
    context: 'Daniel is asking about participation in local projects.',
    questions: [
      'Have you ever taken part in a community project? What did you do?',
      'Why do some people volunteer even when they are already busy?',
      'What can organizers do to attract more volunteers?',
      'Describe a community problem that volunteers could help address.',
      'Which skills are most useful when people from different backgrounds work together?',
      'Should schools require students to complete community service? Why or why not?',
      'How can a small volunteer project create a long-term effect?',
      'What kind of project would you personally like to join in the future?'
    ]
  }
];

function hashSeed(input) {
  const hex = crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 8);
  return Number.parseInt(hex, 16) || 1;
}

export function seededRandom(seedInput = Date.now()) {
  let state = hashSeed(seedInput) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function choose(items, random) {
  return items[Math.floor(random() * items.length)];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createFallbackPack({ seed = crypto.randomUUID(), target = 130 } = {}) {
  const random = seededRandom(seed);
  const images = shuffle(IMAGE_CATALOG, random);
  const writingPrompt = choose(WRITING_PROMPTS, random);
  const interactiveSpeaking = choose(INTERACTIVE_SPEAKING, random);

  return {
    id: `fallback-${String(seed).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 24)}`,
    seed: String(seed),
    source: 'fallback',
    generatedAt: new Date().toISOString(),
    target,
    notices: ['Demo question bank used. Add an OpenRouter key to generate fresh AI questions.'],
    adaptive: {
      readSelect: shuffle(clone(READ_SELECT), random),
      fillBlanks: shuffle(clone(FILL_BLANKS), random),
      readComplete: shuffle(clone(READ_COMPLETE), random),
      listenType: shuffle(clone(LISTEN_TYPE), random)
    },
    interactiveReading: shuffle(clone(INTERACTIVE_READING), random),
    interactiveListening: shuffle(clone(INTERACTIVE_LISTENING), random),
    openResponses: {
      writePhotos: images.slice(0, 3).map((image, index) => ({
        id: `wp-${index + 1}`,
        type: 'write-photo',
        difficulty: 3 + (index % 2),
        image
      })),
      interactiveWriting: {
        id: 'iw-1',
        type: 'interactive-writing',
        difficulty: 4,
        prompt: writingPrompt.prompt,
        followup: writingPrompt.followup
      },
      speakPhoto: {
        id: 'sp-1',
        type: 'speak-photo',
        difficulty: 4,
        image: images[3]
      },
      readThenSpeak: {
        id: 'rts-1',
        type: 'read-then-speak',
        difficulty: 4,
        prompt: choose(READ_SPEAK_PROMPTS, random)
      },
      interactiveSpeaking: {
        id: 'is-1',
        type: 'interactive-speaking',
        difficulty: 4,
        persona: interactiveSpeaking.persona,
        context: interactiveSpeaking.context,
        questions: shuffle(interactiveSpeaking.questions.slice(0, 8), random).slice(0, 7)
      },
      writingSample: {
        id: 'ws-1',
        type: 'writing-sample',
        difficulty: 4,
        prompt: choose(WRITING_SAMPLE_PROMPTS, random)
      },
      speakingSample: {
        id: 'ss-1',
        type: 'speaking-sample',
        difficulty: 4,
        prompt: choose(SPEAKING_SAMPLE_PROMPTS, random)
      }
    }
  };
}

export const FALLBACK_COUNTS = {
  readSelect: READ_SELECT.length,
  fillBlanks: FILL_BLANKS.length,
  readComplete: READ_COMPLETE.length,
  listenType: LISTEN_TYPE.length,
  interactiveReading: INTERACTIVE_READING.length,
  interactiveListening: INTERACTIVE_LISTENING.length,
  images: IMAGE_CATALOG.length
};

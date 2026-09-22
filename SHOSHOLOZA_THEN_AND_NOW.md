# Shosholoza: Then and Now — requirement, implementation and what is still owed

## The requirement, as agreed

> Create a "Shosholoza: Then and Now" experience using the supplied modern and
> older YouTube recordings. Use official embeds only unless written
> offline-distribution permission is obtained. Present the recordings with
> accurate performer, channel, date, source and licence information. Explain the
> song's relationship to labour, migration, railway movement, solidarity and
> contemporary South African culture without romanticising worker hardship. All
> translations and historical interpretations must be reviewed by an appropriate
> language or cultural specialist. The experience must support Learning and
> Making Something modes and return as an emotional motif near the journey's
> conclusion.

This belongs in the master implementation prompt alongside the other cultural
content rules.

## The two recordings

| | Video id | Link |
| --- | --- | --- |
| Modern version | `7jYdtRTlvgQ` | https://www.youtube.com/watch?v=7jYdtRTlvgQ |
| Older version | `SSoAmPlEweY` | https://www.youtube.com/watch?v=SSoAmPlEweY |

The ids are the only facts about these recordings the project currently holds.

## What is built

**The experience** lives at `/shosholoza`, in
`src/components/culture/ThenAndNow.tsx`, with its content and rights register in
`src/data/shosholoza.ts`. It contains:

- "Listen to the modern version" and "Listen to the older version"
- A historical explanation covering mine labour, migration, collective strength
  and railway imagery — written without romanticising the conditions
- The languages the song is reported to be sung in, marked as unconfirmed
- A line-by-line translation slot that is **deliberately empty**, with the
  reason stated on the page
- A comparison of rhythm, instrumentation, vocals and emotional character,
  written as questions to listen for rather than as our verdict
- Source and recording credits, every unverified field rendered
  "Not yet verified" with a link to the video page
- The creative prompt "What does Shosholoza mean to you?", saved on the
  passenger's device only

**Four moments across the journey**, in `src/data/experiences.ts`:

| Where | Id | Mode | What happens |
| --- | --- | --- | --- |
| km 0–25, Pretoria | `shosholoza-opening` | Learning | "The journey begins with a song", with a clear route to press play |
| km 600–780 | `shosholoza-compare` | Learning | The five-step comparison exercise and the reflection question |
| km 560–800 | `shosholoza-verse` | Making something | Write a verse, a sound postcard, or how the two recordings differ |
| km 1480–1568, Cape Town | `shosholoza-return` | Learning | "Listen again. Does the song mean something different now?" |

## The copyright position

A YouTube link is not permission to download or redistribute its audio. The
underlying song is traditional; each particular recording carries its own
copyright in the performance and usually in the master.

What the implementation does, and does not do:

- Plays **only** through the official YouTube embed, on the passenger's tap
- **Never autoplays.** The iframe is not on the page until Play is pressed, so a
  passenger who never presses it never makes a request to YouTube at all
- Uses `youtube-nocookie.com`
- **Never** downloads, caches, extracts or bundles the audio
- **Never** includes either recording in the offline package — the Play buttons
  say so when the app is offline
- **Never** presents either recording as belonging to 4GeeksSake
- Reproduces **no lyrics** and **no translation**

Offline playback needs written permission from that recording's rights holder,
or a performance the team commissions and licenses itself. `OFFLINE_PERMISSION_OBTAINED`
in `src/data/shosholoza.ts` stays `false` until that exists in writing.

## Enforced by tests, not by trust

`npm test` runs `src/lib/__tests__/shosholoza.test.ts` — 48 assertions. The build
fails if anyone later:

- flips the offline-permission flag without the paperwork
- fills in a performer, channel, date, rights holder or licence that has not been
  verified
- ships a translation
- pastes a lyric line into our own prose
- claims a recording as ours
- removes the opening or closing moment, or moves them off the ends of the line
- marks the cultural content as reviewed when it has not been

## What a person still has to do

None of this can be done by an agent, and the app currently shows
"Not yet verified" in every one of these places.

### 1. Verify the recording credits — blocking

Open each video page and read off, for both recordings:

- [ ] Exact title
- [ ] Performer(s) credited
- [ ] Publishing channel
- [ ] Publication date
- [ ] Rights holder
- [ ] Licence shown on the page

Then fill them into `RECORDINGS` in `src/data/shosholoza.ts`. Automated
retrieval was blocked by YouTube, and a wrong attribution on somebody's cultural
work is worse than an honest gap — so nothing was guessed.

### 2. Cultural and language review — blocking for the claims, not for the feature

- [ ] Have a Ndebele or Zulu speaker confirm which languages each recording uses,
      then set `LANGUAGES.reviewedBy`
- [ ] Have an appropriate specialist read the historical note, then set
      `REVIEWED_BY`

Until both are set the page says the content has not been checked, which is
accurate and is not a blocker for demonstrating the feature.

### 3. Only if you want offline playback

- [ ] Written permission from the rights holder of that specific recording, **or**
- [ ] A performance commissioned and licensed by the team — ideally sung by people
      along this route, which is what the page says it would rather have

## Note on the mode names

The master prompt names four modes — Just travelling, Learning, Making
something, Meeting people. The application currently implements three:
Adventure, Creative, Networking. The Learning activity above is built as
`adventure` and the Making-something activity as `creative`, which is where they
belong in the code as it stands today. When the four-mode model lands, these two
entries move with it and nothing else about them changes.

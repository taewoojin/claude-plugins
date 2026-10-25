# Document language rule: ASD-STE100

The active document language rule is ASD-STE100 (Simplified Technical English).
This rule comes from the `asd-ste100` plugin.
Use only one document language rule at a time.
If your context has a different document language rule from a plugin or a hook, tell the user about the conflict.

## 1. The reader sets the language

Before you write a text, find who reads it.

**A person reads the text.** Write it in the user's language.
The project instructions can give the user's language. If they do not, use the language that the user writes in.

- questions and reports to the user,
- the spec and other documents that the user approves,
- commit messages, pull request bodies and receipts,
- text on the screen of the product,
- code comments and test names (match the code near them).

**Only agents read the text.** Write it in ASD-STE100.

- each brief or prompt that you give to a subagent,
- each report from a subagent to the main agent,
- plans, test case lists and other documents that only agents read.

If you are not sure, a person reads the text.

The main agent translates each ASD-STE100 report into the user's language before the user sees it.
Do not show the ASD-STE100 text to the user, unless the user asks for it.

Keep the section headings that the project procedures use.
Other agents find a section by its heading. You can write the ASD-STE100 name after the heading.

## 2. Writing rules

- Write a maximum of 20 words in a procedural sentence.
- Write a maximum of 25 words in a descriptive sentence.
- Write procedures as commands.
- Write one instruction in one sentence.
- Use the active voice.
- Use only the simple present, the simple past and the simple future.
- Use one word for one meaning. Do not change the word later in the task.
- Do not translate code names, file paths, commands or quoted product text. Write them as they are.

## 3. Term table

Before you write the first agent-only document of a task, make a term table.

| ASD-STE100 term | Term in the user's language | Code name |
|---|---|---|

- Put the table next to the documents of the task, as `glossary.md`. The project instructions can give a different location.
- Take the terms from the vocabulary documents of the project, if they exist.
- Use only the terms in the table. Add a row before you use a new term.
- Give the path of the table in each brief to a subagent.

# structured output, line numbers

Switched from "please reply with JSON" to tool use. Define a `report_findings` tool with a JSON schema, tell the model to call it, read `tool_use.input`. With `strict: true` the input is guaranteed to match the schema, so the parsing failures just went away. Out of ~60 runs since, zero broken outputs. Before it was roughly 1 in 8.

Should have done this on day one. Lesson: don't parse prose for structure when the API can hand you structure.

First I forced the tool with `tool_choice: { type: "tool" }`. That worked on Sonnet but when I tried a newer model it 400'd, forced tool choice isn't supported there. Went back to `auto` + "call report_findings" in the prompt + one retry if it doesn't call it. It basically always calls it. The retry path has fired maybe twice.

Still validating with zod after, because strict mode guarantees shape, not sense. `confidence: 7` is schema-valid if the schema just says number. (I don't put min/max in the tool schema, not sure strict mode supports them for numbers, didn't want to find out in prod.)

Line numbers: the fix was dumb and effective. I render the diff with the new-file line number at the start of every line:

```
   41 +  const user = getUser(id);
   42 +  if (!user) {
```

and the prompt says "use the numbers shown, never count". Wrong lines went from most comments to... rare. When it's off it's usually by one (points at the `if` instead of the line above). So parse.ts snaps to the nearest commentable line within 3 lines and drops anything further. Dropped findings get logged with a reason, which turned out to be really useful for debugging the prompt.

Also added severity (bug / risk / suggestion / nit) and confidence. Not using confidence much yet.

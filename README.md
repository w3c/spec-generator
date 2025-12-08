[![Lint status](https://github.com/w3c/spec-generator/actions/workflows/lint.yml/badge.svg)](https://github.com/w3c/spec-generator/actions/workflows/lint.yml)
[![Tests status](https://github.com/w3c/spec-generator/actions/workflows/test.yml/badge.svg)](https://github.com/w3c/spec-generator/actions/workflows/test.yml)

# Spec Generator

This exposes a service to automatically generate specs from various source formats.

## Setup

Clone or download the repository, then install dependencies:

```
npm install
```

### Bikeshed preparation

In order for the server to field requests for Bikeshed documents,
`bikeshed` must be installed such that it is executable by the user running the server.
Version 5.3.6 is required at minimum, as it contains fixes related to JSON output.

One straightforward installation method is [`pipx`](https://pipx.pypa.io/),
which is designed for installing Python applications (as opposed to libraries),
and is available through various package managers.

```
pipx install bikeshed
```

## Running the server

Start the server listening on port 8000 by default:

```bash
npm start
```

You can specify a port like so:

```bash
PORT=3000 npm start
```

When developing, you can use auto-reload:

```bash
npm run watch
```

`tsx` can be skipped by building then running directly:

```bash
npm run build
node server.js
```

This also supports the `PORT` environment variable as described above.

To clear out built files, use `git clean`:

- `git clean -ix` will present an interactive confirmation prompt
- `git clean -fx` will remove the files immediately

## API

Spec Generator has a single endpoint, which is a `GET /`. This endpoint accepts parameters on its
query string. If the call is successful the generated content of the specification is returned.

* `type` (required). The type of generator for this content. Currently the only supported value is
  `respec`.
* `url` (required). The URL of the draft to fetch and generate from.
* `publishDate`. The date at which the publication of this draft is supposed to occur.

### Errors

If a required parameter is missing or has a value that is not understood, the generator returns a
`400` error with a JSON payload the `error` field of which is the human-readable error message.

If the specific generator encounters a problem a similar error (mostly likely `500`) with the same
sort of JSON message is returned. Specific generator types can extend this behaviour. The `respec`
generator only returns `500` errors.

The HTTP response status code is `200` even when there are processing errors and warnings. Processing errors and warnings are signaled with the help of `x-errors-count` and `x-warnings-count` response headers respectively instead.

## Writing generators

Generators are simple to write and new ones can easily be added. Simply add a new one under
`generators` and load it into the `genMap` near the top of `server.js`.

Generators must export a `generate()` method which takes a URL, a set of parameters (from the list
of optional ones that the API supports), and a callback to invoke upon completion.

If there is an error, the callback's first argument must be an object with a `status` field being
an HTTP error code and a `message` field containing the error message. If the generator is
successful the first argument is `null` and the second is the generated content.

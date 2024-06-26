[
    {
        "extends": ["airbnb-base", "prettier"],
        "plugins": ["prettier"],
        "rules": {
            "prettier/prettier": "error",
            "func-names": "off",
            "vars-on-top": "off",
            "consistent-return": "off"
        },
        "overrides": [
            {
                "files": ["index.html"],
                "plugins": [
                    "html"
                ]
            },
            {
                "files": ["server.js", "generators/*.js", "tools/**/*.js"],
                "plugins": ["node"],
                "extends": ["plugin:node/recommended"]
            },
            {
                "files": ["test/*.js"],
                "env": {
                    "mocha": true
                },
                "rules": {
                    "node/no-unpublished-require": "off"
                },
                "plugins": ["node"],
                "extends": "plugin:node/recommended"
            }
        ]
    }
]

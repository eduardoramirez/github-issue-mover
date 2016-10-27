# Github Issue Mover

Move bulk github issues from one repo to another.

### Usage
```javascript
let issueMover = new IssueMover({type: 'oauth', token: 'myToken'})
issueMover.setConfigs('repo1', 'repo2')
issueMover.move()
```

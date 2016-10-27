'use strict'

const Github = require('github')
const moment = require('moment')

function timeout(delay) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, delay)
  })
}

/**
 * This script handles moving issues from one repo to another
 */
class IssueMover {
  constructor(auth) {
    this._github = new Github({
      version: '3.0.0',
      protocol: 'https',
      host: 'api.github.com',
      timeout: 5000,
    })

    this._github.authenticate(auth)
  }

  setConfigs(source, target, opt_state, opt_labels) {
    this._source = source
    this._target = target
    this._state = opt_state || 'open'
    this._labels = opt_labels
  }

  move() {
    if (!this._source || !this._target) {
      console.error('Source and destination repos must be set.')
      return
    }

    let params = {
      user: this._source.owner,
      repo: this._source.repo,
      state: this._state,
      per_page: 100
    }

    this._github.issues.getForRepo(params)
      .then(res => this._paginate(res, []))
      .then(issues => {
        let promise = Promise.resolve()
        issues.forEach(issue => {
          promise = promise
          .then(() => timeout(500))
          .then(() => this._moveIssue(issue))
        })
      })
      .catch(err => {
        console.error(err)
        process.exit(1)
      })
  }


  _getNextPage(res) {
    return new Promise((resolve, reject) => {
      this._github.getNextPage(res, (err, _res) => {
        if (err) { return reject(err) }
        resolve(_res)
      })
    })
  }

  _paginate(res, acc) {
    acc = acc.concat(res)
    if (this._github.hasNextPage(res)) {
      return this._getNextPage(res)
        .then(_res => this._paginate(_res, acc))
    }

    return Promise.resolve(acc)
  }

  _moveIssue(existingIssue) {
    if (existingIssue.pull_request || !this._hasCorrectLabels(existingIssue.labels)) return

    let prettyCreatedAt = moment(existingIssue.created_at).format('MMMM Do YYYY, h:mm a')
    let clonedIssue = {
      user: this._target.owner,
      repo: this._target.repo,
      title: existingIssue.title,
      body: `From @${existingIssue.user.login} on ${prettyCreatedAt}\n\n${existingIssue.body}\n\n_Copied from original issue: ${existingIssue.html_url}_`,
      labels: existingIssue.labels,
      assignees: existingIssue.assignees ? existingIssue.assignees.map(assignee => assignee.login): []
    }

    let newIssue
    return this._github.issues.create(clonedIssue)
      .then(_newIssue => {
        newIssue = _newIssue
        return this._cloneComments(existingIssue.number, newIssue.number)
      })
      .then(() => {
        if (existingIssue.state == 'closed') {
          return this._closeIssue(this._target, newIssue)
        }
      })
      .then(() => this._linkIssue(existingIssue, newIssue))
      .then(() => this._closeIssue(this._source, existingIssue))
      .catch(err => {
        console.error(err)
        process.exit(1)
      })
  }

  _cloneComments(sourceIssueNumber, targetIssueNumber) {
    let params = {
      user: this._source.owner,
      repo: this._source.repo,
      number: sourceIssueNumber,
      per_page: 100
    }
    return this._github.issues.getComments(params)
      .then(res => this._paginate(res, []))
      .then(comments => {
        let promise = Promise.resolve()
        comments.forEach(comment => {
          let prettyCreatedAt = moment(comment.created_at).format('MMMM Do YYYY, h:mm a')
          let cloneComment = {
            user: this_target.owner,
            repo: this._target.repo,
            number: targetIssueNumber,
            body: `From @${comment.user.login} on ${prettyCreatedAt}\n\n${comment.body}`
          }

          promise = promise
            .then(() => timeout(500))
            .then(() => this._github.issues.createComment(cloneComment))
        })
        return promise
      })
  }

  _closeIssue(info, issue) {
    if (issue.state == 'closed') return

    let closeIssueParams = {
      user: info.owner,
      repo: info.repo,
      number: issue.number,
      state: 'closed'
    }
    return this._github.issues.edit(closeIssueParams)
  }

  _linkIssue(existingIssue, newIssue) {
    let commentIssueParam = {
      user: this._source.owner,
      repo: this._source.repo,
      number: existingIssue.number,
      body: `This issue was moved to ${newIssue.html_url}`
    }
    return this._github.issues.createComment(commentIssueParam)
  }

  _hasCorrectLabels(labels) {
    if (!this._labels) return true

    let matchedLabels = labels.map(label => this._labels.indexOf(label.name) >= 0)
    return matchedLabels.some(el => !!el)
  }
}

module.exports = IssueMover

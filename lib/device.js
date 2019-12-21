/* global module, require */

var util = require('util')
var Client = require('castv2-client').Client
var DefaultMediaReceiver = require('castv2-client').DefaultMediaReceiver
var EventEmitter = require('events').EventEmitter
var mime = require('mime')
var debug = require('debug')('Device')

/**
 * Chromecast
 * Supported Media: https://developers.google.com/cast/docs/media
 * Receiver Apps: https://developers.google.com/cast/docs/receiver_apps
 */

/**
 * Device
 * @param {Object} opts               Options
 * @param {String} opts.name          name
 * @param {String} opts.friendlyName  Friendly name
 * @param {Array}  opts.host          IP address
 */
var Device = function (opts) {
  EventEmitter.call(this)
  this.name = opts.name
  this.friendlyName = opts.friendlyName
  this.host = opts.host
  this.playing = false
}

module.exports = Device

util.inherits(Device, EventEmitter)

Device.prototype.play = function (resource, opts, callback) {
  // Handle optional parameters
  if (typeof opts === 'function') {
    callback = opts
    opts = {}
  }
  if (!callback) callback = noop

  var self = this

  // Use a fresh client
  if (self.client) self.client.close()

  debug('Connecting to host: ' + self.host)

  self.client = new Client()
  self.client.connect(self.host, function () {
    debug('Connected')
    self.emit('connected')

    debug('Launching app...')
    self.client.launch(DefaultMediaReceiver, function (err, player) {
      if (err) {
        debug(err)
        if (callback) {
          callback(err)
        }
        return
      }

      self.player = player
      self._privatePlayMedia(resource, opts, callback)

      player.on('status', function (status) {
        if (status) {
          debug('PlayerState = %s', status.playerState)
          self.emit('status', status)
        }
      })
    })
  })

  self.client.on('error', function (err) {
    debug('Error: %s', err.message)
    self.client.close()
  })
}

Device.prototype._privatePlayMedia = function (resource, opts, callback) {
  var self = this
  var options = {}
  var media = {}

  if (typeof resource === 'string') {
    media = {
      contentId: resource,
      contentType: mime.getType(resource) || 'video/mp4'
    }
  } else {
    // By default
    media = {
      contentId: resource.url,
      contentType: resource.contentType || mime.getType(resource.url) || 'video/mp4'
    }

    if (resource.subtitles) {
      var tracks = []
      var i = 0
      for (var subs in resource.subtitles) {
        var track = {
          trackId: i,
          type: 'TEXT',
          trackContentId: subs.url,
          trackContentType: 'text/vtt',
          name: subs.name,
          language: subs.language,
          subtype: 'SUBTITLES'
        }
        tracks.push(track)
        i++
      }

      media.tracks = tracks
      options.activeTrackIds = [0]
    }

    // Config subtitles
    if (resource.subtitles_style) {
      media.textTrackStyle = resource.subtitles_style
      self.subtitlesStyle = resource.subtitles_style
    }

    // Config cover
    if (resource.cover) {
      media.metadata = {
        type: 0,
        metadataType: 0,
        title: resource.cover.title,
        images: [{
          url: resource.cover.url
        }]
      }
    }
  }

  // If it's a video
  if (media.contentType.indexOf('video') !== -1) {
    options.autoplay = true
    options.currentTime = opts.seconds || 0
  }

  self.player.load(media, options, function (err, status) {
    self.playing = true
    if (callback) callback(err, status)
  })
}

Device.prototype.getStatus = function (callback) {
  this.player.getStatus(callback)
}

Device.prototype.seekTo = function (newCurrentTime, callback) {
  this.player.seek(newCurrentTime, callback)
}

Device.prototype.seek = function (seconds, callback) {
  var self = this
  self.getStatus(function (err, status) {
    if (err) return callback(err)
    var newCurrentTime = status.currentTime + seconds
    self.seekTo(newCurrentTime, callback)
  })
}

Device.prototype.pause = function (callback) {
  this.playing = false
  this.player.pause(callback)
}

Device.prototype.resume =
Device.prototype.unpause = function (callback) {
  this.playing = true
  this.player.play(callback)
}

Device.prototype.setVolume = function (volume, callback) {
  this.client.setVolume({ level: volume }, callback)
}

Device.prototype.stop = function (callback) {
  var self = this
  self.playing = false
  self.player.stop(callback)
}

Device.prototype.setVolumeMuted = function (muted, callback) {
  this.client.setVolume({ muted: muted }, callback)
}

Device.prototype.subtitlesOff = function (callback) {
  this.player.media.sessionRequest({
    type: 'EDIT_TRACKS_INFO',
    activeTrackIds: [] // turn off subtitles
  }, callback)
}

Device.prototype.changeSubtitles = function (subIdx, callback) {
  this.player.media.sessionRequest({
    type: 'EDIT_TRACKS_INFO',
    activeTrackIds: [subIdx] // cahnge subtitles to subIdx
  }, callback)
}

Device.prototype.changeSubtitlesSize = function (fontScale, callback) {
  var self = this
  self.subtitlesStyle.fontScale = fontScale
  this.player.media.sessionRequest({
    type: 'EDIT_TRACKS_INFO',
    textTrackStyle: self.subtitlesStyle
  }, callback)
}

Device.prototype.close = function (callback) {
  var self = this
  self.client.stop(self.player, function () {
    self.client.close()
    self.client = null
    debug('Device closed')
    if (callback) callback()
  })
}

function noop () {}
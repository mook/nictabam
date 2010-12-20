//  komode: le=unix language=javascript codepage=utf8 tab=8 notabs indent=2

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/imServices.jsm");

function Nictabam() {
}

Nictabam.prototype = {
  /** nsISupports **/
  classDescription: "Nictabam XPCOM Component",
  classID:          Components.ID("{df0dfd97-9261-4207-80c7-6634311bfe55}"),
  contractID:       "@instantbird.extensions.mook.wordpress.com/nictabam;1",
  QueryInterface:   XPCOMUtils.generateQI([Ci.nsIObserver]),

  /** nsIObserver **/
  observe: function Nictabam_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "profile-after-change":
        Services.obs.addObserver(this, "quit-application-granted", false);
        Services.obs.addObserver(this, "conversation-loaded", false);
        break;
      case "quit-application-granted":
        Services.obs.removeObserver(this, "quit-application-granted");
        Services.obs.removeObserver(this, "conversation-loaded");
        break;
      case "conversation-loaded":
        this.onBrowserCreated(aSubject);
        break;
    }
  },
  
  /** internal methods **/
  /**
   * Event handler when a <browser type="content-conversation"/> is created
   */
  onBrowserCreated: function Nictabam_onBrowserCreated(aBrowser) {
    var document = aBrowser.ownerDocument;
    var conversationBinding = document.getBindingParent(aBrowser);
    if (!conversationBinding) {
      // this browser isn't in a <conversation/> - maybe it's in the pref dialog
      // trying to show a preview or something else not interesting
      return;
    }
    if (!("editor" in conversationBinding) || !conversationBinding.editor) {
      return;
    }
    conversationBinding.editor
                       .addEventListener("keypress", this.onEditorKeyPress, true);

    var appendMessage = aBrowser.appendMessage;
    aBrowser.appendMessage = function Nictabam_appendMessage(aMsg) {
      if (aMsg.containsNick && aMsg.incoming) {
        conversationBinding._Nictabam_lastContainsNick = aMsg.who;
      }
      return appendMessage.apply(this, Array.slice(arguments));
    };
  },
  
  onEditorKeyPress: function Nictabam_onEditorKeyPress(aEvent) {
    // we only care about tab completion
    if (aEvent.keyCode != aEvent.DOM_VK_TAB) {
      return;
    }
    aEvent.preventDefault();

    // record the various positions before we modified the text
    var input = aEvent.target;
    var old = { start:  input.selectionStart,
                end:    input.selectionEnd,
                length: input.value.length
              };
    var convBinding = input.ownerDocument.getBindingParent(input);
    var conv = convBinding.conv;
    var buddies = [];
    if (conv instanceof Ci.purpleIConvChat) {
      let participants = conv.getParticipants();
      while (participants.hasMoreElements()) {
        // TODO: skip the user
        buddies.push(participants.getNext()
                                 .QueryInterface(Ci.purpleIConvChatBuddy)
                                 .name);
      }
    }
    else if (conv instanceof Ci.purpleIConvIM) {
      buddies = [conv.buddy.userName]; 
    }

    var lastNick = convBinding._Nictabam_lastContainsNick || null;

    /* Insertion Rules
     *
     * If the input is empty: insert the nick of the last person to mention your
     * nick, plus ": "
     * If the input is not empty: Find the last word typed; attempt to find the
     * longest common prefix of the names of buddies in this conversation that
     * starts with the given word.  If the input has only one word, append ": ".
     */

    /**
     * Gets the completion string
     * @param aWord the word to complete against
     * @param aSkipSelf if true, skip the user. (not implemented)
     * @return [name, fullMatch]
     *         name - the completion string
     *         fullMatch - true if the match was unique nick name
     */
    function getCompletion(aWord, aSkipSelf) {
      let names = buddies.filter(function(buddy) {
        var target = aWord.toLowerCase();
        if (buddy.length < target.length) {
          return false;
        }
        return buddy.substring(0, target.length).toLowerCase() == target;
      });
      if (names.length == 1) {
        // exact match
        return [names[0], true];
      }
      else if (names.length > 0) {
        // more than one name; find the longest common prefix
        let lcases = [n.toLowerCase() for each (n in names)].sort();
        // since the array is sorted, the _first_ and _last_ names are the
        // furtherest apart, therefore will be as prefix-different as possible
        let [first, last] = [lcases.shift(), lcases.pop()];
        let length;
        for (length = 0; length < first.length; ++length) {
          if (first[length] != last[length]) {
            break;
          }
        }
        return [names[0].substring(0, length), false];
      }
      // no match
      return ["", false];
    }
    if (old.length > 0) {
      if (/\s/.test(input.value)) {
        // more than one word; complete the nick from the last word
        let match = /\S+$/.exec(input.value);
        if (!match) {
          // the last word ended on a space. do nothing.
          return;
        }
        let [name, fullMatch] = getCompletion(match[0], false);
        let length = input.value.length - match[0].length;
        // remember to add a space at the end if this is a fullMatch
        input.value = input.value.substring(0, length) +
                      name +
                      (fullMatch ? " " : "");
      }
      else {
        // only one word; find the nick which starts with that nick
        let [name, complete] = getCompletion(input.value, true);
        input.value = name + (complete ? ": " : "");
      }
    }
    else {
      // empty; find the last person to highlight the user
      if (lastNick) {
        input.value = lastNick + ": " + input.value;
      }
      else if (buddies.length == 1) {
        // well, there's only one other person here...
        input.value = buddies[0] + ": " + input.value;
      }
    }

    // restore the selection
    input.setSelectionRange(old.start + input.textLength - old.length,
                            old.end + input.textLength - old.length);
  }

};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([Nictabam]);

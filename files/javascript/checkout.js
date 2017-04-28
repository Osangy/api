// Create a Stripe client
var stripe = Stripe(stripe_pub_key);

// Create an instance of Elements
var elements = stripe.elements();

// Custom styling can be passed to options when creating an Element.
// (Note that this demo uses a wider set of styles than the guide below.)
var style = {
  base: {
    color: '#32325d',
    lineHeight: '24px',
    fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
    fontSmoothing: 'antialiased',
    fontSize: '16px',
    '::placeholder': {
      color: '#aab7c4'
    }
  },
  invalid: {
    color: '#fa755a',
    iconColor: '#fa755a'
  }
};

// Create an instance of the card Element
var card = elements.create('card', {style: style});

// Add an instance of the card Element into the `card-element` <div>
card.mount('#card-element');

// Handle real-time validation errors from the card Element.
card.addEventListener('change', function(event) {
  if(event.complete) document.getElementById("buttonPay").disabled = false;
  else document.getElementById("buttonPay").disabled = true;
  
  var displayError = document.getElementById('card-errors');
  if (event.error) {
    displayError.textContent = event.error.message;
  } else {
    displayError.textContent = '';
  }
});

// Handle form submission
var form = document.getElementById('payment-form');
form.addEventListener('submit', function(event) {
  event.preventDefault();
  document.getElementById("buttonPay").disabled = true;

  stripe.createToken(card).then(function(result) {
    if (result.error) {
      // Inform the user if there was an error
      var errorElement = document.getElementById('card-errors');
      errorElement.textContent = result.error.message;
      document.getElementById("buttonPay").disabled = false;
    } else {
      // Send the token to your server
      payWithToken(result.token.id, document.getElementById("cartId").value);
    }
  });
});


function payWithToken(token, cartId){

  axios.post('/shop/validatePayment', {
    token: token,
    cartId: cartId
  })
  .then((response) => {
    console.log(response);
    if(MessengerExtensions.isInExtension()){
      leaveTab();
    }
    else{
      document.getElementById("buttonPay").disabled = true;
      var successElement = document.getElementById('card-success');
      successElement.textContent = "Votre paiement a bien été validé. Vous pouvez fermer cette page.";
    }
  })
  .catch(function (error) {
    console.log(error);
    document.getElementById("buttonPay").disabled = false;
  });

}

window.extAsyncInit = function() {
    // the Messenger Extensions JS SDK is done loading
    var isSupported = MessengerExtensions.isInExtension();

    if(isSupported){
      MessengerExtensions.getUserID(function success(uids) {
        var psid = uids.psid;
        console.log("User id : "+psid);

      }, function error(err) {

      });
    }
    else{
      console.log("Messenger extensions not supported");
    }

};


function leaveTab(){
  MessengerExtensions.requestCloseBrowser(function success() {
    console.log("leaved");
  }, function error(err) {

  });
}


/* ACTIONS */

function closeAllExcept(contentName){
  switch (contentName) {
    case 'productContent':
      var addressContent = document.getElementById('addressContent');
      addressContent.className = "row hidden";
      var recapContent = document.getElementById('recapContent');
      recapContent.className = "row hidden";
      break;
    case 'addressContent':
      var productContent = document.getElementById('productContent');
      productContent.className = "row hidden";
      var recapContent = document.getElementById('recapContent');
      recapContent.className = "row hidden";
      break;
    case 'recapContent':
      var productContent = document.getElementById('productContent');
      productContent.className = "row hidden";
      var addressContent = document.getElementById('addressContent');
      addressContent.className = "row hidden";
      break;
    default:

  }
}

document.getElementById("buttonPay").disabled = true;
var productTitle = document.getElementById('productTitle');
productTitle.addEventListener('click', function(event) {
  var productContent = document.getElementById('productContent');
  productContent.classList.toggle("hidden");
  closeAllExcept('productContent');
});

var addressTitle = document.getElementById('addressTitle');
addressTitle.addEventListener('click', function(event) {
  var addressContent = document.getElementById('addressContent');
  addressContent.classList.toggle("hidden");
  closeAllExcept('addressContent');
});

var recapTitle = document.getElementById('recapTitle');
recapTitle.addEventListener('click', function(event) {
  var recapContent = document.getElementById('recapContent');
  recapContent.classList.toggle("hidden");
  closeAllExcept('recapContent');
});

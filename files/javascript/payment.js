function stripeResponseHandler(status, response) {
  // Grab the form:
  var $form = $('#payment-form');

  if (response.error) { // Problem!

    // Show the errors on the form:
    $form.find('.payment-errors').text(response.error.message);
    $form.find('.submit').prop('disabled', false); // Re-enable submission

  } else { // Token was created!

    // Get the token ID:
    var token = response.id;

    // Insert the token ID into the form so it gets submitted to the server:
    $form.append($('<input type="hidden" name="stripeToken">').val(token));

    payWithToken(token, $("input[name=cartId]").val());

    // Submit the form:
    //$form.get(0).submit();
  }
};

$(function() {
  mountCard();
});

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


function payWithToken(token, cartId){

  console.log(token);
  console.log(cartId);

  axios.post('/shop/validatePayment', {
    token: token,
    cartToken: cartId
  })
  .then(function (response) {
    console.log(response);
    if(MessengerExtensions.isInExtension()){
      leaveTab();
    }
    else{
      setSuccessOutcome();
    }
  })
  .catch(function (error) {
    console.log(error);
    document.getElementById("buttonPay").disabled = false;
  });

}

function setOutcome(event){
  var successElement = document.querySelector('.success');
  var errorElement = document.querySelector('.error');
  successElement.classList.remove('visible');
  errorElement.classList.remove('visible');

  if (event.token) {
    // Use the token to create a charge or a customer
    // https://stripe.com/docs/charges
    successElement.querySelector('.token').textContent = result.token.id;
    successElement.classList.add('visible');
  } else if (event.error) {
    errorElement.textContent = result.error.message;
    errorElement.classList.add('visible');
  }
}

function setErrorOutcome(error) {
  var successElement = document.querySelector('.success');
  var errorElement = document.querySelector('.error');
  successElement.classList.remove('visible');
  errorElement.classList.remove('visible');

  errorElement.textContent = error.message;
  errorElement.classList.add('visible');
}

function setSuccessOutcome() {
  var successElement = document.querySelector('.success');
  var errorElement = document.querySelector('.error');
  successElement.classList.remove('visible');
  errorElement.classList.remove('visible');

  successElement.textContent = "Your payment has been received. Thanks you. You can come back to your conversation";
  successElement.classList.add('visible');
}


function mountCard(){

  var card = elements.create('card', {
    style: {
      base: {
        iconColor: '#666EE8',
        color: '#31325F',
        lineHeight: '40px',
        fontWeight: 300,
        fontFamily: 'Helvetica Neue',
        fontSize: '15px',

        '::placeholder': {
          color: '#CFD7E0',
        },
      },
    }
  });
  card.mount('#card-element');

  card.on('change', function(event) {
    setOutcome(event);
  });


  document.querySelector('form').addEventListener('submit', function(e) {
    e.preventDefault();
    document.getElementById("buttonPay").disabled = true;
    stripe.createToken(card).then((result) => {
      if (result.error) {
        // Inform the user if there was an error
        document.getElementById("buttonPay").disabled = false;
        setErrorOutcome(result.error);
      } else {
        // Send the token to your server
        payWithToken(result.token.id, document.getElementsByName("cartToken")[0].value);
      }
    });
  });

}

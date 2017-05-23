// Create a Stripe client
var stripe = Stripe(stripe_pub_key);

// Create an instance of Elements
var elements = stripe.elements();

//Init
var hasValidPhone = false;
var hasValidEmail = false;
var hasValidCard = false;
var customerPhone = null;
var customerEmail = null;
var okForPersoInfos= false;

//Address
var nameAddress = null;
var routeAddress = null;
var postalAddress = null;
var cityAddress = null;
var countryAddress= null;

console.log(cart);

//elements
var addressContent = document.getElementById('displayAddressContent');

//Init everything
initAll();

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

card.addEventListener('focus', function(e) {
  var productContent = document.getElementById('productContent');
  productContent.className = "row hidden";
  var addressContent = document.getElementById('addressContent');
  addressContent.className = "row hidden";
  var recapContent = document.getElementById('recapContent');
  recapContent.className = "row hidden";
  var infosContent = document.getElementById('infosContent');
  infosContent.className = "row hidden";

  var arrows = document.getElementsByClassName("glyphicon");
  Array.prototype.forEach.call(arrows, (arrow, index) => {
    arrow.className = "glyphicon glyphicon-menu-right right"
  });
})

// Handle real-time validation errors from the card Element.
card.addEventListener('change', function(event) {
  if(event.complete){
    hasValidCard = true;
  }
  else{
    hasValidCard = false
  }
  validateToPay();
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

/* SERVER */

function payWithToken(token, cartId){

  var options = {
    token: token,
    cartId: cartId,
    shippingAddress: {
      recipientName: nameAddress,
      address: routeAddress,
      postalCode: postalAddress,
      locality: cityAddress,
      country: countryAddress
    },
    customerInfos:{
      email: customerEmail,
      phone: customerPhone
    }
  }

  axios.post('/shop/validatePayment', options)
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

/* INIT AND VALIDATIONS */

function initAll(){
  //See if we have the address
  nameAddress = `${cart.shippingAddress.recipientName}`;
  if(cart.shippingAddress.address){
    nameAddress = `${cart.shippingAddress.recipientName}`;
    routeAddress = `${cart.shippingAddress.address}`;
    postalAddress = `${cart.shippingAddress.postalCode}`;
    cityAddress = `${cart.shippingAddress.locality}`;
    countryAddress= `${cart.shippingAddress.country}`;
    document.getElementById('address-form').className = 'form-horizontal hidden';
    document.getElementById('displayAddress').className = 'row';
    document.getElementById('addressTitleLabel').style.color = "#333333";
    addressContent.innerHTML = buildHtmlAddress();
  }
  else {
    if(nameAddress) document.getElementById('fullNameInput').value = nameAddress;
    if(postalAddress) document.getElementById('postalCodeInput').value = postalAddress;
    if(routeAddress) document.getElementById('addressInput').value = routeAddress;
    if(cityAddress) document.getElementById('cityInput').value = cityAddress;
    if(countryAddress) document.getElementById('countryInput').value = countryAddress;
    document.getElementById('address-form').className = 'form-horizontal';
    document.getElementById('displayAddress').className = 'row hidden';
    document.getElementById('addressTitleLabel').style.color = "#e74c3c";
  }

  if(cart.user.email){
    hasValidEmail = true;
    customerEmail = cart.user.email;
    document.getElementById('inputEmail').value = customerEmail;
  }
  if(cart.user.phoneNumber){
    hasValidPhone = true;
    customerPhone = cart.user.phoneNumber;
    document.getElementById('inputPhone').value = customerPhone;
  }

  validatePersoInfos();
}

function validatePersoInfos(){
  if(hasValidPhone && hasValidEmail){
    okForPersoInfos = true;
    document.getElementById('infosTitleLabel').style.color = "#333333";
  }
  else{
    okForPersoInfos = false;
    document.getElementById('infosTitleLabel').style.color = "#e74c3c";
  }

  validateToPay();
}

function validateToPay(){
  if(okForPersoInfos && validateAddress() && hasValidCard){
    document.getElementById("buttonPay").disabled = false;
  }
  else{
    document.getElementById("buttonPay").disabled = true;
  }
}

function validateAddress(){
  if(nameAddress && routeAddress && postalAddress && cityAddress && countryAddress) return true;
  else return false;
}


/* ACTIONS */

function closeAllExcept(contentName){
  switch (contentName) {
    case 'productContent':
      updateArrows(0)
      var addressContent = document.getElementById('addressContent');
      addressContent.className = "row hidden";
      var recapContent = document.getElementById('recapContent');
      recapContent.className = "row hidden";
      var infosContent = document.getElementById('infosContent');
      infosContent.className = "row hidden";
      break;
    case 'addressContent':
      updateArrows(2)
      var productContent = document.getElementById('productContent');
      productContent.className = "row hidden";
      var recapContent = document.getElementById('recapContent');
      recapContent.className = "row hidden";
      var infosContent = document.getElementById('infosContent');
      infosContent.className = "row hidden";
      break;
    case 'recapContent':
      updateArrows(3)
      var productContent = document.getElementById('productContent');
      productContent.className = "row hidden";
      var addressContent = document.getElementById('addressContent');
      addressContent.className = "row hidden";
      var infosContent = document.getElementById('infosContent');
      infosContent.className = "row hidden";
      break;
    case 'infosContent':
      updateArrows(1)
      var productContent = document.getElementById('productContent');
      productContent.className = "row hidden";
      var addressContent = document.getElementById('addressContent');
      addressContent.className = "row hidden";
      var recapContent = document.getElementById('recapContent');
      recapContent.className = "row hidden";
      break;
    default:

  }
}

function updateArrows(position){
  var arrows = document.getElementsByClassName("glyphicon");
  Array.prototype.forEach.call(arrows, (arrow, index) => {
    if(index == position) arrow.className = "glyphicon glyphicon-menu-down right"
    else arrow.className = "glyphicon glyphicon-menu-right right"
  });
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

var infosTitle = document.getElementById('personalInfos');
infosTitle.addEventListener('click', function(event) {
  var infosContent = document.getElementById('infosContent');
  infosContent.classList.toggle("hidden");
  closeAllExcept('infosContent');
});

var emailForm = document.getElementById('inputEmail');
emailForm.addEventListener('input', function(event){
  var email = event.target.value;
  var emailDiv = document.getElementById('emailDiv');
  hasValidEmail = false;
  if(validateEmail(email)){
    hasValidEmail = true,
    emailDiv.className = 'form-group has-success';
    customerEmail = email;
  }
  else emailDiv.className = 'form-group has-error';
  validatePersoInfos();
})

var phoneForm = document.getElementById('inputPhone');
phoneForm.addEventListener('input', function(event){
  var phone = event.target.value;
  var phoneDiv = document.getElementById('phoneDiv');
  hasValidPhone = false;
  if(validatePhone(phone)){
    hasValidPhone = true;
    phoneDiv.className = 'form-group has-success';
    customerPhone = phone;
  }
  else phoneDiv.className = 'form-group has-error';
  validatePersoInfos();
});

// Handle form submission
var form = document.getElementById('address-form');
form.addEventListener('submit', function(event) {
  event.preventDefault();
  console.log("Valider");
  nameAddress = document.getElementById("fullNameInput").value;
  routeAddress = document.getElementById("addressInput").value;
  postalAddress = document.getElementById("postalCodeInput").value;
  cityAddress = document.getElementById("cityInput").value;
  countryAddress = document.getElementById("countryInput").value;
  if(nameAddress && routeAddress && postalAddress && cityAddress && countryAddress){
    console.log("OK");
    addressContent.innerHTML = buildHtmlAddress();
    document.getElementById('address-form').className = 'form-horizontal hidden';
    document.getElementById('displayAddress').className = 'row';
    document.getElementById('addressTitleLabel').style.color = "#333333";
    validateToPay();
  }
  else console.log("Address not complete");

});

/* MODIFY ADDRESS */

var buttonAddressModify = document.getElementById('address-modify-btn');
buttonAddressModify.addEventListener('click', function(e){
  document.getElementById('address-form').className = 'form-horizontal';
  document.getElementById('displayAddress').className = 'row hidden';

  if(nameAddress) document.getElementById('fullNameInput').value = nameAddress;
  if(postalAddress) document.getElementById('postalCodeInput').value = postalAddress;
  if(routeAddress) document.getElementById('addressInput').value = routeAddress;
  if(cityAddress) document.getElementById('cityInput').value = cityAddress;
  if(countryAddress) document.getElementById('countryInput').value = countryAddress;
})

function buildHtmlAddress(){
  var html = `<strong>${nameAddress}</strong></br>${routeAddress}</br>${postalAddress} ${cityAddress}</br>${countryAddress}`
  return html
}


/* UTILS */

function validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
}

function validatePhone(phone){
  var re = /^[0-9]{10}$/;
  return re.test(phone);
}

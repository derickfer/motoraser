const firebaseConfig = {
apiKey: "AIzaSyBI_ZNuKytSxM_XzWv2SE9xGgF_1ea3qgs",
authDomain: "motoraser-4e869.firebaseapp.com",
projectId: "motoraser-4e869"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const userStatus = document.getElementById("userStatus");

btnLogin.onclick = () => {
const provider = new firebase.auth.GoogleAuthProvider();
auth.signInWithPopup(provider);
};

btnLogout.onclick = () => auth.signOut();

auth.onAuthStateChanged(user => {
if(user){
btnLogin.classList.add("hidden");
btnLogout.classList.remove("hidden");
userStatus.innerText = "Usuário: " + user.displayName;
db.collection("users").doc(user.uid).set({
name:user.displayName,
email:user.email
});
}else{
btnLogin.classList.remove("hidden");
btnLogout.classList.add("hidden");
userStatus.innerText = "Usuário: visitante";
}
});

function initMap(){
navigator.geolocation.getCurrentPosition(pos=>{
const loc={lat:pos.coords.latitude,lng:pos.coords.longitude};
const map=new google.maps.Map(document.getElementById("map"),{zoom:14,center:loc});
new google.maps.Marker({position:loc,map:map});
});
}

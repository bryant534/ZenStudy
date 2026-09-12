(function(){
  const saveAccountBtn = document.getElementById('save-account-btn');
  if(saveAccountBtn){
    saveAccountBtn.addEventListener('click', function(){
      // NOTE: Haven't sent it to the backend yet; just need to add a POST fetch request to the settings endpoint once it's available.
      alert('Account changes saved (dummy — not connected to database)');
    });
  }

  const savePasswordBtn = document.getElementById('save-password-btn');
  if(savePasswordBtn){
    savePasswordBtn.addEventListener('click', function(){
      const current = document.getElementById('current-password').value;
      const next = document.getElementById('new-password').value;
      const confirm = document.getElementById('confirm-password').value;

      if(!current || !next || !confirm){
        alert('All password fields are required');
        return;
      }
      if(next !== confirm){
        alert('New password confirmation does not match');
        return;
      }
      // NOTE: Haven't sent it to the backend yet; just need to add a POST fetch request to the password endpoint once it's available.
      alert('Password update completed (dummy — not connected to database)');
    });
  }

  const deleteBtn = document.getElementById('delete-account-btn');
  if(deleteBtn){
    deleteBtn.addEventListener('click', function(){
      const sure = confirm('Are you sure you want to delete your account? This action cannot be undone.');
      if(sure){
        // NOTE: Haven't sent it to the backend yet; just need to add a POST fetch request to the delete endpoint once it's available.
        alert('Account will be deleted (dummy — not connected to database)');
      }
    });
  }
})();
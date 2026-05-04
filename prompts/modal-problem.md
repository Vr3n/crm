# The Lead Form modal problem

In the membership sale form partial the `create new lead` button does this:

```html
<div
  class="modal fade show"
  data-backdrop="static"
  data-keyboard="false"
  id="modal-container"
  tabindex="-1"
  role="dialog"
  aria-labelledby="modalLabel"
  style="padding-right: 12px; display: block;"
  aria-modal="true"
>
  <div class="modal-dialog modal-lg">
    <form
      hx-post="/crown-vitality/leads/hx/create/"
      hx-target="this"
      hx-swap="outerHTML"
      data-validate=""
      novalidate=""
    >
      <input
        type="hidden"
        name="csrfmiddlewaretoken"
        value="7826FJR1z1tV9poraYNbsOYv90lGtnLDKnVFXFmVVIv8ayzpMt2VnSmSeoetGPAH"
      />

      <div class="card">
        <div class="card-body">
          <div class="card mb-3">
            <div class="card-header">Lead Details</div>
            <div class="card-body">
              <div class="row">
                <div class="col-md-3">
                  <div class="form-group">
                    <label for="id_first_name">
                      First name
                      <span class="text-danger">*</span>
                    </label>

                    <input
                      type="text"
                      name="first_name"
                      id="id_first_name"
                      value=""
                      placeholder=""
                      class="form-control "
                      required=""
                      maxlength="50"
                    />
                  </div>
                </div>
                <div class="col-md-3">
                  <div class="form-group">
                    <label for="id_middle_name"> Middle name </label>

                    <input
                      type="text"
                      name="middle_name"
                      id="id_middle_name"
                      value=""
                      placeholder=""
                      class="form-control "
                      maxlength="50"
                    />
                  </div>
                </div>
                <div class="col-md-3">
                  <div class="form-group">
                    <label for="id_last_name">
                      Last name
                      <span class="text-danger">*</span>
                    </label>

                    <input
                      type="text"
                      name="last_name"
                      id="id_last_name"
                      value=""
                      placeholder=""
                      class="form-control "
                      required=""
                      maxlength="50"
                    />
                  </div>
                </div>
                <div class="col-md-3">
                  <div class="form-group">
                    <label for="id_source"> Source </label>

                    <input
                      type="text"
                      name="source"
                      id="id_source"
                      value=""
                      placeholder=""
                      class="form-control "
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <input
            type="hidden"
            name="organization"
            id="id_organization"
            value="7435a857-f089-4f5e-a3df-98ff0f77fefc"
          />

          <div class="row">
            <div class="col-sm-1 col-md-6">
              <div class="card mb-3">
                <div class="card-header">Mobile Numbers</div>
                <div id="mobile-formset-container" class="card-body">
                  <input
                    type="hidden"
                    name="mobile-TOTAL_FORMS"
                    value="1"
                    id="id_mobile-TOTAL_FORMS"
                  /><input
                    type="hidden"
                    name="mobile-INITIAL_FORMS"
                    value="0"
                    id="id_mobile-INITIAL_FORMS"
                  /><input
                    type="hidden"
                    name="mobile-MIN_NUM_FORMS"
                    value="0"
                    id="id_mobile-MIN_NUM_FORMS"
                  /><input
                    type="hidden"
                    name="mobile-MAX_NUM_FORMS"
                    value="1000"
                    id="id_mobile-MAX_NUM_FORMS"
                  />

                  <div class="form-group">
                    <div class="form-group">
                      <label for="id_mobile-0-mobile_number">
                        Mobile Number
                      </label>

                      <input
                        type="text"
                        name="mobile-0-mobile_number"
                        id="id_mobile-0-mobile_number"
                        value=""
                        placeholder=""
                        class="form-control "
                        maxlength="10"
                        minlength="10"
                      />
                    </div>
                  </div>
                </div>
                <div class="card-footer">
                  <button
                    type="button"
                    class="btn btn-outline-primary"
                    id="add-mobile-btn"
                    hx-get="/crown-vitality/leads/hx/add-mobile-formset-input/"
                    hx-target="#mobile-formset-container"
                    hx-include="input[name='mobile-TOTAL_FORMS']"
                    hx-swap="beforeend"
                  >
                    Add Another Mobile Number
                  </button>
                </div>
              </div>
            </div>

            <div class="col-sm-1 col-md-6">
              <div class="card mb-3">
                <div class="card-header">Email Addresses</div>
                <div id="email-formset-container" class="card-body">
                  <input
                    type="hidden"
                    name="email-TOTAL_FORMS"
                    value="1"
                    id="id_email-TOTAL_FORMS"
                  /><input
                    type="hidden"
                    name="email-INITIAL_FORMS"
                    value="0"
                    id="id_email-INITIAL_FORMS"
                  /><input
                    type="hidden"
                    name="email-MIN_NUM_FORMS"
                    value="0"
                    id="id_email-MIN_NUM_FORMS"
                  /><input
                    type="hidden"
                    name="email-MAX_NUM_FORMS"
                    value="1000"
                    id="id_email-MAX_NUM_FORMS"
                  />

                  <div class="form-group">
                    <div class="form-group">
                      <label for="id_email-0-email"> Email Address </label>

                      <input
                        type="text"
                        name="email-0-email"
                        id="id_email-0-email"
                        value=""
                        placeholder=""
                        class="form-control "
                        maxlength="320"
                      />
                    </div>
                  </div>
                </div>
                <div class="card-footer">
                  <button
                    type="button"
                    class="btn btn-outline-primary"
                    id="add-email-btn"
                    hx-get="/crown-vitality/leads/hx/add-email-formset-input/"
                    hx-target="#email-formset-container"
                    hx-include="input[name='email-TOTAL_FORMS']"
                    hx-swap="beforeend"
                  >
                    Add Another Email
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="card mb-3">
            <div class="card-header">Address Details</div>
            <div class="card-body">
              <div class="row">
                <div class="col-md-4">
                  <div class="form-group">
                    <label for="id_flat_building"> Flat building </label>

                    <input
                      type="text"
                      name="flat_building"
                      id="id_flat_building"
                      value=""
                      placeholder=""
                      class="form-control "
                      maxlength="100"
                    />
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="form-group">
                    <label for="id_landmark"> Landmark </label>

                    <input
                      type="text"
                      name="landmark"
                      id="id_landmark"
                      value=""
                      placeholder=""
                      class="form-control "
                      maxlength="100"
                    />
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="form-group">
                    <label for="id_area"> Area </label>

                    <input
                      type="text"
                      name="area"
                      id="id_area"
                      value=""
                      placeholder=""
                      class="form-control "
                      maxlength="100"
                    />
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="form-group">
                    <label for="id_street"> Street </label>

                    <input
                      type="text"
                      name="street"
                      id="id_street"
                      value=""
                      placeholder=""
                      class="form-control "
                      maxlength="100"
                    />
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="form-group">
                    <label for="id_city"> City </label>

                    <input
                      type="text"
                      name="city"
                      id="id_city"
                      value=""
                      placeholder=""
                      class="form-control "
                      maxlength="100"
                    />
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="form-group">
                    <label for="id_state"> State </label>

                    <input
                      type="text"
                      name="state"
                      id="id_state"
                      value=""
                      placeholder=""
                      class="form-control "
                      maxlength="100"
                    />
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="form-group">
                    <label for="id_pincode"> Pincode </label>

                    <input
                      type="text"
                      name="pincode"
                      id="id_pincode"
                      value=""
                      placeholder=""
                      class="form-control "
                      maxlength="6"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="col-12 gap-4">
            <button type="submit" class="btn btn-primary">
              <span
                class="htmx-indicator spinner-border spinner-border-sm mr-2"
                style="display:none;"
              ></span>
              Save Lead
            </button>
            <button
              type="button"
              class="btn btn-outline-danger"
              onclick="closeLeadModal()"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </form>

    <script>
      document.addEventListener("htmx:afterRequest", function (e) {
        const alertDiv = document.querySelector(".alert");
        if (alertDiv) {
          setTimeout(function () {
            alertDiv.classList.remove("show");
            setTimeout(function () {
              alertDiv.remove();
            }, 300);
          }, 10000);
        }
      });
    </script>

    <script>
      document.addEventListener("htmx:afterSwap", function (e) {
        if (e.target.id === "mobile-formset-container") {
          const totalFormsInput = document.querySelector(
            'input[name="mobile-TOTAL_FORMS"]',
          );
          totalFormsInput.value = parseInt(totalFormsInput.value) + 1;

          // Also update the next form_id in hx-get
          const addBtn = document.getElementById("add-mobile-btn");
          const nextId = parseInt(totalFormsInput.value);
          const newUrl = new URL(
            addBtn.getAttribute("hx-get"),
            window.location.origin,
          );
          newUrl.searchParams.set("form_id", nextId);
          addBtn.setAttribute("hx-get", newUrl.pathname + newUrl.search);
        }
      });
    </script>

    <script>
      document.addEventListener("htmx:afterSwap", function (e) {
        if (e.target.id === "email-formset-container") {
          const totalFormsInput = document.querySelector(
            'input[name="email-TOTAL_FORMS"]',
          );
          totalFormsInput.value = parseInt(totalFormsInput.value) + 1;

          // Also update the next form_id in hx-get
          const addBtn = document.getElementById("add-email-btn");
          const nextId = parseInt(totalFormsInput.value);
          const newUrl = new URL(
            addBtn.getAttribute("hx-get"),
            window.location.origin,
          );
          newUrl.searchParams.set("form_id", nextId);
          addBtn.setAttribute("hx-get", newUrl.pathname + newUrl.search);
        }
      });
    </script>

    <script>
      function closeLeadModal() {
        var form = document.getElementById("lead-create-form-partial");
        if (form) {
          form.reset();
        }
        $("#modal-container").modal("hide");
      }
    </script>
  </div>
</div>
```

While in dashboard.html the button does this:

```html
<div
  class="modal fade show"
  data-backdrop="static"
  data-keyboard="false"
  id="modal-container"
  tabindex="-1"
  role="dialog"
  aria-labelledby="modalLabel"
  style="padding-right: 12px; display: block;"
  aria-modal="true"
>
  <div class="modal-dialog modal-lg">
    <div
      class="modal-content"
      id="modal-form"
      hx-swap="innerHTML"
      hx-target="this"
    >
      <form
        hx-post="/crown-vitality/leads/hx/create/"
        hx-target="this"
        hx-swap="outerHTML"
        data-validate=""
        novalidate=""
      >
        <input
          type="hidden"
          name="csrfmiddlewaretoken"
          value="BuUozP6EbZqisY0AEkVUUDAmeOz5zBameJNXRLByxGsvt7bygPaEPHYJjcsSM3Zq"
        />

        <div class="card">
          <div class="card-body">
            <div class="card mb-3">
              <div class="card-header">Lead Details</div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-3">
                    <div class="form-group">
                      <label for="id_first_name">
                        First name
                        <span class="text-danger">*</span>
                      </label>

                      <input
                        type="text"
                        name="first_name"
                        id="id_first_name"
                        value=""
                        placeholder=""
                        class="form-control is-invalid"
                        required=""
                        maxlength="50"
                      />

                      <div class="invalid-feedback js-custom-error">
                        Please fill out this field.
                      </div>
                    </div>
                  </div>
                  <div class="col-md-3">
                    <div class="form-group">
                      <label for="id_middle_name"> Middle name </label>

                      <input
                        type="text"
                        name="middle_name"
                        id="id_middle_name"
                        value=""
                        placeholder=""
                        class="form-control "
                        maxlength="50"
                      />
                    </div>
                  </div>
                  <div class="col-md-3">
                    <div class="form-group">
                      <label for="id_last_name">
                        Last name
                        <span class="text-danger">*</span>
                      </label>

                      <input
                        type="text"
                        name="last_name"
                        id="id_last_name"
                        value=""
                        placeholder=""
                        class="form-control "
                        required=""
                        maxlength="50"
                      />
                    </div>
                  </div>
                  <div class="col-md-3">
                    <div class="form-group">
                      <label for="id_source"> Source </label>

                      <input
                        type="text"
                        name="source"
                        id="id_source"
                        value=""
                        placeholder=""
                        class="form-control "
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <input
              type="hidden"
              name="organization"
              id="id_organization"
              value="7435a857-f089-4f5e-a3df-98ff0f77fefc"
            />

            <div class="row">
              <div class="col-sm-1 col-md-6">
                <div class="card mb-3">
                  <div class="card-header">Mobile Numbers</div>
                  <div id="mobile-formset-container" class="card-body">
                    <input
                      type="hidden"
                      name="mobile-TOTAL_FORMS"
                      value="1"
                      id="id_mobile-TOTAL_FORMS"
                    /><input
                      type="hidden"
                      name="mobile-INITIAL_FORMS"
                      value="0"
                      id="id_mobile-INITIAL_FORMS"
                    /><input
                      type="hidden"
                      name="mobile-MIN_NUM_FORMS"
                      value="0"
                      id="id_mobile-MIN_NUM_FORMS"
                    /><input
                      type="hidden"
                      name="mobile-MAX_NUM_FORMS"
                      value="1000"
                      id="id_mobile-MAX_NUM_FORMS"
                    />

                    <div class="form-group">
                      <div class="form-group">
                        <label for="id_mobile-0-mobile_number">
                          Mobile Number
                        </label>

                        <input
                          type="text"
                          name="mobile-0-mobile_number"
                          id="id_mobile-0-mobile_number"
                          value=""
                          placeholder=""
                          class="form-control "
                          maxlength="10"
                          minlength="10"
                        />
                      </div>
                    </div>
                  </div>
                  <div class="card-footer">
                    <button
                      type="button"
                      class="btn btn-outline-primary"
                      id="add-mobile-btn"
                      hx-get="/crown-vitality/leads/hx/add-mobile-formset-input/"
                      hx-target="#mobile-formset-container"
                      hx-include="input[name='mobile-TOTAL_FORMS']"
                      hx-swap="beforeend"
                    >
                      Add Another Mobile Number
                    </button>
                  </div>
                </div>
              </div>

              <div class="col-sm-1 col-md-6">
                <div class="card mb-3">
                  <div class="card-header">Email Addresses</div>
                  <div id="email-formset-container" class="card-body">
                    <input
                      type="hidden"
                      name="email-TOTAL_FORMS"
                      value="1"
                      id="id_email-TOTAL_FORMS"
                    /><input
                      type="hidden"
                      name="email-INITIAL_FORMS"
                      value="0"
                      id="id_email-INITIAL_FORMS"
                    /><input
                      type="hidden"
                      name="email-MIN_NUM_FORMS"
                      value="0"
                      id="id_email-MIN_NUM_FORMS"
                    /><input
                      type="hidden"
                      name="email-MAX_NUM_FORMS"
                      value="1000"
                      id="id_email-MAX_NUM_FORMS"
                    />

                    <div class="form-group">
                      <div class="form-group">
                        <label for="id_email-0-email"> Email Address </label>

                        <input
                          type="text"
                          name="email-0-email"
                          id="id_email-0-email"
                          value=""
                          placeholder=""
                          class="form-control "
                          maxlength="320"
                        />
                      </div>
                    </div>
                  </div>
                  <div class="card-footer">
                    <button
                      type="button"
                      class="btn btn-outline-primary"
                      id="add-email-btn"
                      hx-get="/crown-vitality/leads/hx/add-email-formset-input/"
                      hx-target="#email-formset-container"
                      hx-include="input[name='email-TOTAL_FORMS']"
                      hx-swap="beforeend"
                    >
                      Add Another Email
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="card mb-3">
              <div class="card-header">Address Details</div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-4">
                    <div class="form-group">
                      <label for="id_flat_building"> Flat building </label>

                      <input
                        type="text"
                        name="flat_building"
                        id="id_flat_building"
                        value=""
                        placeholder=""
                        class="form-control "
                        maxlength="100"
                      />
                    </div>
                  </div>
                  <div class="col-md-4">
                    <div class="form-group">
                      <label for="id_landmark"> Landmark </label>

                      <input
                        type="text"
                        name="landmark"
                        id="id_landmark"
                        value=""
                        placeholder=""
                        class="form-control "
                        maxlength="100"
                      />
                    </div>
                  </div>
                  <div class="col-md-4">
                    <div class="form-group">
                      <label for="id_area"> Area </label>

                      <input
                        type="text"
                        name="area"
                        id="id_area"
                        value=""
                        placeholder=""
                        class="form-control "
                        maxlength="100"
                      />
                    </div>
                  </div>
                  <div class="col-md-4">
                    <div class="form-group">
                      <label for="id_street"> Street </label>

                      <input
                        type="text"
                        name="street"
                        id="id_street"
                        value=""
                        placeholder=""
                        class="form-control "
                        maxlength="100"
                      />
                    </div>
                  </div>
                  <div class="col-md-4">
                    <div class="form-group">
                      <label for="id_city"> City </label>

                      <input
                        type="text"
                        name="city"
                        id="id_city"
                        value=""
                        placeholder=""
                        class="form-control "
                        maxlength="100"
                      />
                    </div>
                  </div>
                  <div class="col-md-4">
                    <div class="form-group">
                      <label for="id_state"> State </label>

                      <input
                        type="text"
                        name="state"
                        id="id_state"
                        value=""
                        placeholder=""
                        class="form-control "
                        maxlength="100"
                      />
                    </div>
                  </div>
                  <div class="col-md-4">
                    <div class="form-group">
                      <label for="id_pincode"> Pincode </label>

                      <input
                        type="text"
                        name="pincode"
                        id="id_pincode"
                        value=""
                        placeholder=""
                        class="form-control "
                        maxlength="6"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="col-12 gap-4">
              <button type="submit" class="btn btn-primary">
                <span
                  class="htmx-indicator spinner-border spinner-border-sm mr-2"
                  style="display:none;"
                ></span>
                Save Lead
              </button>
              <button
                type="button"
                class="btn btn-outline-danger"
                onclick="closeLeadModal()"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </form>

      <script>
        document.addEventListener("htmx:afterRequest", function (e) {
          const alertDiv = document.querySelector(".alert");
          if (alertDiv) {
            setTimeout(function () {
              alertDiv.classList.remove("show");
              setTimeout(function () {
                alertDiv.remove();
              }, 300);
            }, 10000);
          }
        });
      </script>

      <script>
        document.addEventListener("htmx:afterSwap", function (e) {
          if (e.target.id === "mobile-formset-container") {
            const totalFormsInput = document.querySelector(
              'input[name="mobile-TOTAL_FORMS"]',
            );
            totalFormsInput.value = parseInt(totalFormsInput.value) + 1;

            // Also update the next form_id in hx-get
            const addBtn = document.getElementById("add-mobile-btn");
            const nextId = parseInt(totalFormsInput.value);
            const newUrl = new URL(
              addBtn.getAttribute("hx-get"),
              window.location.origin,
            );
            newUrl.searchParams.set("form_id", nextId);
            addBtn.setAttribute("hx-get", newUrl.pathname + newUrl.search);
          }
        });
      </script>

      <script>
        document.addEventListener("htmx:afterSwap", function (e) {
          if (e.target.id === "email-formset-container") {
            const totalFormsInput = document.querySelector(
              'input[name="email-TOTAL_FORMS"]',
            );
            totalFormsInput.value = parseInt(totalFormsInput.value) + 1;

            // Also update the next form_id in hx-get
            const addBtn = document.getElementById("add-email-btn");
            const nextId = parseInt(totalFormsInput.value);
            const newUrl = new URL(
              addBtn.getAttribute("hx-get"),
              window.location.origin,
            );
            newUrl.searchParams.set("form_id", nextId);
            addBtn.setAttribute("hx-get", newUrl.pathname + newUrl.search);
          }
        });
      </script>

      <script>
        function closeLeadModal() {
          var form = document.getElementById("lead-create-form-partial");
          if (form) {
            form.reset();
          }
          $("#modal-container").modal("hide");
        }
      </script>
    </div>
  </div>
</div>
```
